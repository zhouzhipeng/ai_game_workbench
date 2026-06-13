import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import { runFfmpeg } from "../processing/ffmpeg";

export const LOCAL_COMFYUI_VIDEO_MODEL = "local/comfyui-video-workflow";
const DEFAULT_COMFYUI_VIDEO_WORKFLOW_FILES = [
  "ai-game-workbench-wan22-ti2v-api.json",
  "ai-game-workbench-ltxv-i2v-api.json"
] as const;

export interface LocalComfyUiVideoGenerationInput {
  model: string;
  prompt: string;
  durationSeconds: number;
  resolution: string;
  imagePaths: readonly string[];
  workingDirectory: string;
  ffmpegPath?: string;
}

export interface LocalComfyUiVideoGenerationResult {
  buffer: Buffer;
  extension: "mp4" | "mov" | "webm";
  providerResponse: Record<string, unknown>;
}

export type LocalComfyUiVideoGenerator = (
  input: LocalComfyUiVideoGenerationInput
) => Promise<LocalComfyUiVideoGenerationResult>;

interface ComfyUiWorkflowConfig {
  baseUrl: string;
  workflow: Record<string, unknown>;
  workflowSource: string;
  timeoutMs: number;
  fps: number;
  negativePrompt: string;
  filenamePrefix: string;
}

interface UploadedComfyImage {
  image: string;
  response: unknown;
}

interface ComfyOutputFile {
  filename: string;
  subfolder?: string;
  type?: string;
}

interface ImageSubject {
  input: Buffer;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function isLocalComfyUiVideoModel(model: string): boolean {
  return model === LOCAL_COMFYUI_VIDEO_MODEL;
}

export function isLocalComfyUiVideoConfigured(): boolean {
  return Boolean(resolveComfyWorkflowSource());
}

export async function generateLocalComfyUiVideo(
  input: LocalComfyUiVideoGenerationInput
): Promise<LocalComfyUiVideoGenerationResult> {
  if (input.imagePaths.length === 0) {
    throw new Error("ComfyUI workflow video requires at least one first-frame image.");
  }
  const config = await readComfyUiWorkflowConfig();
  const firstImagePath = input.imagePaths[0];
  if (!firstImagePath) {
    throw new Error("ComfyUI workflow video requires a first-frame image.");
  }
  const exactSheetMode = getExactSheetMode();
  if (shouldGenerateExactSheetVideo(input, exactSheetMode)) {
    try {
      return await generateExactSheetVideo(input, config);
    } catch (error) {
      if (exactSheetMode === "always") {
        throw error;
      }
    }
  }
  const uploadedImages = await Promise.all(
    input.imagePaths.map((imagePath) => uploadComfyImage(config.baseUrl, imagePath))
  );
  const prompt = applyWorkflowPlaceholders(config.workflow, buildComfyPlaceholders(input, config, uploadedImages));
  assertComfyPrompt(prompt);
  const clientId = `ai-game-workbench-${randomUUID()}`;
  const promptId = await submitComfyPrompt(config.baseUrl, prompt, clientId);
  const history = await waitForComfyHistory(config.baseUrl, promptId, config.timeoutMs);
  const outputFile = findVideoOutputFile(history);
  if (!outputFile) {
    throw new Error(`ComfyUI workflow completed but did not return an MP4/WebM/MOV file for prompt ${promptId}.`);
  }
  const buffer = await downloadComfyOutputFile(config.baseUrl, outputFile);
  return {
    buffer,
    extension: extensionToVideoType(extname(outputFile.filename)),
    providerResponse: {
      provider: "local-comfyui",
      model: input.model,
      comfyUrl: config.baseUrl,
      workflowSource: config.workflowSource,
      promptId,
      output: outputFile
    }
  };
}

async function readComfyUiWorkflowConfig(): Promise<ComfyUiWorkflowConfig> {
  const source = resolveComfyWorkflowSource();
  if (!source) {
    throw new Error([
      "ComfyUI video workflow is not configured.",
      "Set LOCAL_COMFYUI_VIDEO_WORKFLOW to a ComfyUI API-format workflow JSON file, or set LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON to the JSON content.",
      "Use a 16 GB friendly image-to-video workflow such as LTXV or Wan 480p/512px, then export it from ComfyUI with Dev mode > Save API Format.",
      "Supported placeholders: {{prompt}}, {{negativePrompt}}, {{inputImage}}, {{inputImage0}}, {{inputImage1}}, {{duration}}, {{resolution}}, {{width}}, {{height}}, {{frames}}, {{fps}}, {{seed}}, and {{filenamePrefix}}."
    ].join("\n"));
  }
  const workflow = parseComfyWorkflow(source.content, source.label);
  return {
    baseUrl: normalizeComfyBaseUrl(process.env.LOCAL_COMFYUI_URL ?? "http://127.0.0.1:8000"),
    workflow,
    workflowSource: source.label,
    timeoutMs: Number(process.env.LOCAL_COMFYUI_VIDEO_TIMEOUT_MS ?? 30 * 60 * 1000),
    fps: Number(process.env.LOCAL_COMFYUI_VIDEO_FPS ?? 12),
    negativePrompt: process.env.LOCAL_COMFYUI_VIDEO_NEGATIVE_PROMPT?.trim() ?? "",
    filenamePrefix: process.env.LOCAL_COMFYUI_VIDEO_PREFIX?.trim() || `ai-game-workbench/video-${Date.now()}`
  };
}

function resolveComfyWorkflowSource(): { content: string; label: string } | undefined {
  const inlineWorkflow = process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON?.trim();
  if (inlineWorkflow) {
    return { content: inlineWorkflow, label: "LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON" };
  }
  const path = (process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW ?? process.env.LOCAL_COMFYUI_WORKFLOW_PATH)?.trim();
  if (path && existsSync(path)) {
    return {
      content: readFileSyncUtf8(path),
      label: path
    };
  }
  if (process.env.LOCAL_COMFYUI_VIDEO_DISABLE_DEFAULTS === "1") {
    return undefined;
  }
  for (const defaultPath of getDefaultComfyWorkflowCandidates()) {
    if (existsSync(defaultPath)) {
      return {
        content: readFileSyncUtf8(defaultPath),
        label: defaultPath
      };
    }
  }
  return undefined;
}

function getDefaultComfyWorkflowCandidates(): string[] {
  const bases = [
    process.env.LOCAL_COMFYUI_BASE_DIR,
    process.env.COMFYUI_BASE_DIR,
    process.env.COMFYUI_BASE_DIRECTORY,
    "D:\\comfyui_data",
    "C:\\comfyui_data",
    process.env.USERPROFILE ? join(process.env.USERPROFILE, "comfyui_data") : undefined,
    process.env.APPDATA ? join(process.env.APPDATA, "ComfyUI") : undefined
  ];
  const candidates = bases
    .filter((base): base is string => typeof base === "string" && base.trim().length > 0)
    .flatMap((base) =>
      DEFAULT_COMFYUI_VIDEO_WORKFLOW_FILES.map((file) => join(base, "user", "default", "workflows", file))
    );
  return [...new Set(candidates)];
}

function readFileSyncUtf8(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function parseComfyWorkflow(content: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`ComfyUI workflow ${label} must be a JSON object.`);
  }
  if (Array.isArray(parsed.nodes)) {
    throw new Error(`ComfyUI workflow ${label} is a UI workflow. Export it with Dev mode > Save API Format.`);
  }
  const prompt = isRecord(parsed.prompt) ? parsed.prompt : parsed;
  assertComfyPrompt(prompt);
  return prompt;
}

function buildComfyPlaceholders(
  input: LocalComfyUiVideoGenerationInput,
  config: ComfyUiWorkflowConfig,
  uploadedImages: readonly UploadedComfyImage[]
): Record<string, string | number> {
  const firstImage = uploadedImages[0];
  if (!firstImage) {
    throw new Error("ComfyUI workflow video requires a first-frame image.");
  }
  const size = parseVideoResolution(input.resolution);
  const duration = Number.isFinite(input.durationSeconds) && input.durationSeconds > 0 ? input.durationSeconds : 4;
  const fps = Number.isFinite(config.fps) && config.fps > 0 ? config.fps : 12;
  const placeholders: Record<string, string | number> = {
    prompt: input.prompt,
    negativePrompt: config.negativePrompt,
    inputImage: firstImage.image,
    duration,
    resolution: input.resolution || `${size.width}x${size.height}`,
    width: size.width,
    height: size.height,
    frames: normalizeVideoFrameCount(duration, fps),
    fps,
    seed: Math.floor(Math.random() * 2147483647),
    filenamePrefix: config.filenamePrefix
  };
  for (const [index, image] of uploadedImages.entries()) {
    placeholders[`inputImage${index}`] = image.image;
  }
  return placeholders;
}

function parseVideoResolution(value: string | undefined): { width: number; height: number } {
  const trimmed = value?.trim().toLowerCase() ?? "";
  const exact = /^(\d+)\s*x\s*(\d+)$/.exec(trimmed);
  if (exact) {
    return { width: Number(exact[1]), height: Number(exact[2]) };
  }
  if (trimmed === "1080p") {
    return { width: 1024, height: 1024 };
  }
  if (trimmed === "720p") {
    return { width: 768, height: 768 };
  }
  if (trimmed === "480p") {
    return { width: 512, height: 512 };
  }
  return { width: 512, height: 512 };
}

function normalizeVideoFrameCount(durationSeconds: number, fps: number): number {
  const raw = Math.max(9, Math.round(durationSeconds * fps));
  return Math.max(9, Math.round((raw - 1) / 8) * 8 + 1);
}

function getExactSheetMode(): "auto" | "always" | "off" {
  const value = process.env.LOCAL_COMFYUI_VIDEO_EXACT_SHEET_MODE?.trim().toLowerCase();
  if (!value || value === "auto") {
    return "auto";
  }
  if (value === "1" || value === "true" || value === "always" || value === "on") {
    return "always";
  }
  return "off";
}

function shouldGenerateExactSheetVideo(
  input: LocalComfyUiVideoGenerationInput,
  mode: "auto" | "always" | "off"
): boolean {
  if (mode === "off") {
    return false;
  }
  if (mode === "always") {
    return true;
  }
  const normalizedPrompt = input.prompt.toLowerCase();
  return normalizedPrompt.includes("walk") || normalizedPrompt.includes("步行");
}

async function generateExactSheetVideo(
  input: LocalComfyUiVideoGenerationInput,
  config: ComfyUiWorkflowConfig
): Promise<LocalComfyUiVideoGenerationResult> {
  const firstImagePath = input.imagePaths[0];
  if (!firstImagePath) {
    throw new Error("Exact sheet video requires a first-frame image.");
  }
  const size = parseVideoResolution(input.resolution);
  const duration = Number.isFinite(input.durationSeconds) && input.durationSeconds > 0 ? input.durationSeconds : 4;
  const fps = Number.isFinite(config.fps) && config.fps > 0 ? config.fps : 12;
  const frameCount = normalizeVideoFrameCount(duration, fps);
  const tempDir = await mkdtemp(join(tmpdir(), "ai-game-workbench-exact-sheet-"));
  const framesDir = join(tempDir, "frames");
  const outputPath = join(tempDir, "exact-sheet.mp4");
  try {
    await mkdir(framesDir, { recursive: true });
    const sheet = await sharp(firstImagePath)
      .resize(size.width, size.height, { fit: "fill", kernel: "lanczos3" })
      .ensureAlpha()
      .png()
      .toBuffer();
    const cellWidth = Math.floor(size.width / 2);
    const cellHeight = Math.floor(size.height / 2);
    const cells = await Promise.all([0, 1, 2, 3].map(async (index) => {
      const left = (index % 2) * cellWidth;
      const top = Math.floor(index / 2) * cellHeight;
      const cell = await sharp(sheet)
        .extract({ left, top, width: cellWidth, height: cellHeight })
        .ensureAlpha()
        .png()
        .toBuffer();
      const background = await sampleImageBackground(cell);
      return {
        left,
        top,
        background,
        subject: await extractForegroundSubject(cell, background)
      };
    }));

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const cycle = frameIndex / Math.max(1, frameCount - 1);
      const phase = Math.sin(cycle * Math.PI * 2);
      const bob = Math.round(Math.abs(phase) * Math.max(1, cellHeight * 0.012));
      const composites = [];
      for (const [index, cell] of cells.entries()) {
        composites.push({
          input: await sharp({
            create: {
              width: cellWidth,
              height: cellHeight,
              channels: 4,
              background: { ...cell.background, alpha: 1 }
            }
          }).png().toBuffer(),
          left: cell.left,
          top: cell.top
        });
        const horizontal = index >= 2
          ? Math.round(phase * Math.max(1, cellWidth * 0.012)) * (index === 2 ? -1 : 1)
          : Math.round(phase * Math.max(1, cellWidth * 0.006));
        composites.push({
          input: cell.subject.input,
          left: clampInteger(cell.left + cell.subject.left + horizontal, cell.left, cell.left + cellWidth - cell.subject.width),
          top: clampInteger(cell.top + cell.subject.top - bob, cell.top, cell.top + cellHeight - cell.subject.height)
        });
      }
      const frame = await sharp({
        create: {
          width: size.width,
          height: size.height,
          channels: 4,
          background: { r: 0, g: 255, b: 0, alpha: 1 }
        }
      }).composite(composites).png().toBuffer();
      await writeFile(join(framesDir, `frame_${String(frameIndex + 1).padStart(4, "0")}.png`), frame);
    }

    await runFfmpeg(input.ffmpegPath ?? process.env.FFMPEG_PATH ?? "ffmpeg", [
      "-y",
      "-framerate",
      String(fps),
      "-i",
      join(framesDir, "frame_%04d.png"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath
    ]);
    return {
      buffer: await readFile(outputPath),
      extension: "mp4",
      providerResponse: {
        provider: "local-comfyui",
        model: input.model,
        mode: "exact-sheet-preserve",
        workflowSource: config.workflowSource,
        fps,
        frameCount,
        resolution: `${size.width}x${size.height}`
      }
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function sampleImageBackground(input: Buffer): Promise<{ r: number; g: number; b: number }> {
  const image = sharp(input).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const samples = [
    readRawColor(data, info.width, 0, 0),
    readRawColor(data, info.width, info.width - 1, 0),
    readRawColor(data, info.width, 0, info.height - 1),
    readRawColor(data, info.width, info.width - 1, info.height - 1)
  ];
  return samples.sort((a, b) => b.count - a.count)[0]?.color ?? { r: 0, g: 255, b: 0 };
}

function readRawColor(
  data: Buffer,
  width: number,
  x: number,
  y: number
): { count: number; color: { r: number; g: number; b: number } } {
  const offset = ((y * width) + x) * 4;
  return {
    count: 1,
    color: {
      r: data[offset] ?? 0,
      g: data[offset + 1] ?? 255,
      b: data[offset + 2] ?? 0
    }
  };
}

async function extractForegroundSubject(
  input: Buffer,
  background: { r: number; g: number; b: number }
): Promise<ImageSubject> {
  const image = sharp(input).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  const threshold = 46;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = ((y * info.width) + x) * 4;
      if (isForegroundPixel(data, offset, background, threshold)) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left || bottom < top) {
    return {
      input,
      left: 0,
      top: 0,
      width: info.width,
      height: info.height
    };
  }
  const width = right - left + 1;
  const height = bottom - top + 1;
  const subject = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (((top + y) * info.width) + left + x) * 4;
      const targetOffset = ((y * width) + x) * 4;
      subject[targetOffset] = data[sourceOffset] ?? 0;
      subject[targetOffset + 1] = data[sourceOffset + 1] ?? 0;
      subject[targetOffset + 2] = data[sourceOffset + 2] ?? 0;
      subject[targetOffset + 3] = isForegroundPixel(data, sourceOffset, background, threshold)
        ? data[sourceOffset + 3] ?? 255
        : 0;
    }
  }
  return {
    input: await sharp(subject, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    left,
    top,
    width,
    height
  };
}

function isForegroundPixel(
  data: Buffer,
  offset: number,
  background: { r: number; g: number; b: number },
  threshold: number
): boolean {
  const alpha = data[offset + 3] ?? 0;
  if (alpha === 0) {
    return false;
  }
  const dr = (data[offset] ?? 0) - background.r;
  const dg = (data[offset + 1] ?? 0) - background.g;
  const db = (data[offset + 2] ?? 0) - background.b;
  return Math.sqrt(dr * dr + dg * dg + db * db) > threshold;
}

function clampInteger(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function applyWorkflowPlaceholders(value: unknown, placeholders: Record<string, string | number>): unknown {
  if (typeof value === "string") {
    return replacePlaceholderString(value, placeholders);
  }
  if (Array.isArray(value)) {
    return value.map((item) => applyWorkflowPlaceholders(item, placeholders));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, applyWorkflowPlaceholders(item, placeholders)])
    );
  }
  return value;
}

function replacePlaceholderString(value: string, placeholders: Record<string, string | number>): string | number {
  const exact = /^{{\s*([a-zA-Z0-9_]+)\s*}}$/.exec(value);
  if (exact) {
    return placeholders[exact[1] ?? ""] ?? value;
  }
  return value.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key: string) =>
    String(placeholders[key] ?? match)
  );
}

async function uploadComfyImage(baseUrl: string, imagePath: string): Promise<UploadedComfyImage> {
  const buffer = await readFile(imagePath);
  const formData = new FormData();
  formData.append("image", new Blob([new Uint8Array(buffer)]), basename(imagePath));
  formData.append("type", "input");
  formData.append("overwrite", "true");
  const response = await fetch(`${baseUrl}/upload/image`, {
    method: "POST",
    body: formData
  });
  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(`ComfyUI image upload failed (${response.status}): ${body.text}`);
  }
  const parsed = body.json;
  const name = readStringField(parsed, "name") || basename(imagePath);
  const subfolder = readStringField(parsed, "subfolder");
  return {
    image: subfolder ? `${subfolder}/${name}` : name,
    response: parsed
  };
}

async function submitComfyPrompt(baseUrl: string, prompt: Record<string, unknown>, clientId: string): Promise<string> {
  const response = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, client_id: clientId })
  });
  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(`ComfyUI prompt submission failed (${response.status}): ${body.text}`);
  }
  const promptId = readStringField(body.json, "prompt_id");
  if (!promptId) {
    throw new Error(`ComfyUI prompt submission did not return prompt_id: ${body.text}`);
  }
  return promptId;
}

async function waitForComfyHistory(baseUrl: string, promptId: string, timeoutMs: number): Promise<unknown> {
  const deadline = Date.now() + (Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30 * 60 * 1000);
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`);
    const body = await readResponseBody(response);
    if (!response.ok) {
      throw new Error(`ComfyUI history request failed (${response.status}): ${body.text}`);
    }
    const historyItem = isRecord(body.json) ? body.json[promptId] : undefined;
    if (historyItem) {
      const status = isRecord(historyItem) && isRecord(historyItem.status) ? historyItem.status : undefined;
      const statusText = readStringField(status, "status_str");
      if (statusText === "error") {
        throw new Error(`ComfyUI workflow failed: ${JSON.stringify(status ?? historyItem)}`);
      }
      if (statusText === "success" || Boolean(isRecord(status) ? status.completed : false)) {
        return historyItem;
      }
    }
    await delay(1000);
  }
  throw new Error(`ComfyUI workflow timed out waiting for prompt ${promptId}.`);
}

function findVideoOutputFile(history: unknown): ComfyOutputFile | undefined {
  const files = collectComfyOutputFiles(isRecord(history) ? history.outputs : history);
  return files.find((file) => isVideoExtension(file.filename));
}

function collectComfyOutputFiles(value: unknown): ComfyOutputFile[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectComfyOutputFiles(item));
  }
  if (!isRecord(value)) {
    return [];
  }
  const filename = readStringField(value, "filename");
  if (filename) {
    return [{
      filename,
      subfolder: readStringField(value, "subfolder"),
      type: readStringField(value, "type")
    }];
  }
  return Object.values(value).flatMap((item) => collectComfyOutputFiles(item));
}

async function downloadComfyOutputFile(baseUrl: string, file: ComfyOutputFile): Promise<Buffer> {
  const url = new URL(`${baseUrl}/view`);
  url.searchParams.set("filename", file.filename);
  if (file.subfolder) {
    url.searchParams.set("subfolder", file.subfolder);
  }
  url.searchParams.set("type", file.type || "output");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ComfyUI output download failed (${response.status}): ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function readResponseBody(response: Response): Promise<{ text: string; json: unknown }> {
  const text = await response.text();
  if (!text.trim()) {
    return { text, json: undefined };
  }
  try {
    return { text, json: JSON.parse(text) as unknown };
  } catch {
    return { text, json: undefined };
  }
}

function normalizeComfyBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "") || "http://127.0.0.1:8000";
}

function assertComfyPrompt(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value) || Array.isArray(value)) {
    throw new Error("ComfyUI workflow must be an API-format prompt object.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringField(value: unknown, key: string): string | undefined {
  return isRecord(value) && typeof value[key] === "string" ? value[key] as string : undefined;
}

function isVideoExtension(filename: string): boolean {
  const extension = extname(filename).toLowerCase();
  return extension === ".mp4" || extension === ".webm" || extension === ".mov";
}

function extensionToVideoType(extension: string): "mp4" | "mov" | "webm" {
  const normalized = extension.toLowerCase();
  if (normalized === ".mov") {
    return "mov";
  }
  if (normalized === ".webm") {
    return "webm";
  }
  return "mp4";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
