import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

export const LOCAL_COMFYUI_VIDEO_MODEL = "local/comfyui-video-workflow";
const DEFAULT_COMFYUI_VIDEO_WORKFLOW_FILE = "ai-game-workbench-ltxv-i2v-api.json";

export interface LocalComfyUiVideoGenerationInput {
  model: string;
  prompt: string;
  durationSeconds: number;
  resolution: string;
  imagePaths: readonly string[];
  workingDirectory: string;
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
    .map((base) => join(base, "user", "default", "workflows", DEFAULT_COMFYUI_VIDEO_WORKFLOW_FILE));
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
