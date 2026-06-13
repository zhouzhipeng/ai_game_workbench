import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import sharp from "sharp";

export const LOCAL_CODEX_IMAGE_MODEL = "local/gpt-image-2";
export const LOCAL_CODEX_VIDEO_MODEL = "local/gpt-sora";

export interface LocalCodexImageGenerationInput {
  model: string;
  prompt: string;
  targetSize: number;
  keyColor: string;
  imagePaths: readonly string[];
  workingDirectory: string;
}

export interface LocalCodexImageGenerationResult {
  buffer: Buffer;
  extension: "png";
  providerResponse: Record<string, unknown>;
}

export interface LocalCodexVideoGenerationInput {
  model: string;
  prompt: string;
  durationSeconds: number;
  resolution: string;
  imagePaths: readonly string[];
  workingDirectory: string;
}

export interface LocalCodexVideoGenerationResult {
  buffer: Buffer;
  extension: "mp4" | "mov" | "webm";
  providerResponse: Record<string, unknown>;
}

export type LocalCodexImageGenerator = (
  input: LocalCodexImageGenerationInput
) => Promise<LocalCodexImageGenerationResult>;

export type LocalCodexVideoGenerator = (
  input: LocalCodexVideoGenerationInput
) => Promise<LocalCodexVideoGenerationResult>;

interface CodexCommand {
  command: string;
  argsPrefix: string[];
  label: string;
}

interface LocalSoraCommand {
  command: string;
  argsTemplate: string[];
  label: string;
}

interface GeneratedImageSnapshot {
  path: string;
  mtimeMs: number;
}

export function isLocalCodexImageModel(model: string): boolean {
  return model === LOCAL_CODEX_IMAGE_MODEL;
}

export function isLocalCodexVideoModel(model: string): boolean {
  return model === LOCAL_CODEX_VIDEO_MODEL;
}

export async function generateLocalCodexImage(
  input: LocalCodexImageGenerationInput
): Promise<LocalCodexImageGenerationResult> {
  const command = resolveCodexCommand();
  const generatedImagesBefore = snapshotGeneratedImages();
  const runDir = await mkdtemp(join(tmpdir(), "ai-game-workbench-local-codex-"));
  const messagePath = join(runDir, "last-message.txt");
  try {
    const args = [
      ...command.argsPrefix,
      "exec",
      "--json",
      "--sandbox",
      "danger-full-access",
      "--skip-git-repo-check",
      "-C",
      input.workingDirectory,
      ...input.imagePaths.flatMap((imagePath) => ["--image", imagePath]),
      "-o",
      messagePath,
      input.prompt
    ];
    const result = await runCommand(command.command, args, input.workingDirectory);
    const lastMessage = existsSync(messagePath) ? await readFile(messagePath, "utf8") : "";
    if (result.exitCode !== 0) {
      throw new Error([
        `Local Codex image generation failed with exit code ${result.exitCode}.`,
        result.stderr.trim(),
        lastMessage.trim()
      ].filter(Boolean).join("\n"));
    }
    const newImage = findNewestGeneratedImage(generatedImagesBefore);
    if (!newImage) {
      throw new Error([
        "Local Codex did not create an image file.",
        lastMessage.trim(),
        result.stderr.trim()
      ].filter(Boolean).join("\n"));
    }
    const sourceBuffer = await readFile(newImage.path);
    const buffer = await resizeImageToTarget(sourceBuffer, input.targetSize, input.keyColor);
    return {
      buffer,
      extension: "png",
      providerResponse: {
        provider: "local-codex",
        model: input.model,
        codexCommand: command.label,
        generatedImagePath: newImage.path,
        message: lastMessage.trim() || undefined
      }
    };
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}

export async function generateLocalCodexVideo(
  input: LocalCodexVideoGenerationInput
): Promise<LocalCodexVideoGenerationResult> {
  const localSoraCommand = resolveLocalSoraCommand();
  if (localSoraCommand) {
    return generateLocalSoraVideoWithCommand(input, localSoraCommand);
  }
  if (!shouldUseCodexForLocalSora()) {
    throw new Error([
      "Local GPT Sora is not configured.",
      "Set LOCAL_GPT_SORA_BIN to a local video generator executable that writes an MP4 output file.",
      "By default the workbench calls it with: --prompt-file <prompt.txt> --output <output.mp4> --duration <seconds> --resolution <resolution> --image <path>...",
      "Set LOCAL_GPT_SORA_ARGS to a JSON string array if your generator uses different arguments.",
      "The previous Codex prompt fallback is disabled because this environment does not expose a callable Sora/video tool. Set LOCAL_GPT_SORA_USE_CODEX=1 only when your Codex runtime has a real video generator."
    ].join("\n"));
  }
  return generateLocalCodexVideoViaCodex(input);
}

async function generateLocalSoraVideoWithCommand(
  input: LocalCodexVideoGenerationInput,
  command: LocalSoraCommand
): Promise<LocalCodexVideoGenerationResult> {
  const runDir = await mkdtemp(join(tmpdir(), "ai-game-workbench-local-sora-"));
  const promptPath = join(runDir, "prompt.txt");
  const outputPath = join(runDir, "output.mp4");
  try {
    const prompt = buildLocalSoraPrompt(input);
    await writeFile(promptPath, prompt, "utf8");
    const args = expandLocalSoraArgs(command.argsTemplate, {
      prompt,
      promptPath,
      outputPath,
      input
    });
    const result = await runCommand(
      command.command,
      args,
      input.workingDirectory,
      "Local GPT Sora generation"
    );
    if (result.exitCode !== 0) {
      throw new Error([
        `Local GPT Sora command failed with exit code ${result.exitCode}.`,
        result.stderr.trim(),
        result.stdout.trim()
      ].filter(Boolean).join("\n"));
    }
    if (!existsSync(outputPath)) {
      throw new Error([
        `Local GPT Sora command did not create the expected MP4: ${outputPath}`,
        result.stderr.trim(),
        result.stdout.trim()
      ].filter(Boolean).join("\n"));
    }
    return {
      buffer: await readFile(outputPath),
      extension: extensionToVideoType(extname(outputPath)),
      providerResponse: {
        provider: "local-sora-command",
        model: input.model,
        localSoraCommand: command.label,
        outputPath,
        stdout: result.stdout.trim() || undefined,
        stderr: result.stderr.trim() || undefined
      }
    };
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}

async function generateLocalCodexVideoViaCodex(
  input: LocalCodexVideoGenerationInput
): Promise<LocalCodexVideoGenerationResult> {
  const command = resolveCodexCommand();
  const generatedVideosBefore = snapshotGeneratedVideos();
  const runDir = await mkdtemp(join(tmpdir(), "ai-game-workbench-local-sora-"));
  const messagePath = join(runDir, "last-message.txt");
  try {
    const args = [
      ...command.argsPrefix,
      "exec",
      "--json",
      "--sandbox",
      "danger-full-access",
      "--skip-git-repo-check",
      "-C",
      input.workingDirectory,
      ...input.imagePaths.flatMap((imagePath) => ["--image", imagePath]),
      "-o",
      messagePath,
      buildLocalSoraPrompt(input)
    ];
    const result = await runCommand(command.command, args, input.workingDirectory, "Local GPT Sora generation");
    const lastMessage = existsSync(messagePath) ? await readFile(messagePath, "utf8") : "";
    if (result.exitCode !== 0) {
      throw new Error([
        `Local GPT Sora generation failed with exit code ${result.exitCode}.`,
        result.stderr.trim(),
        lastMessage.trim()
      ].filter(Boolean).join("\n"));
    }
    const newVideo = findNewestGeneratedVideo(generatedVideosBefore);
    if (!newVideo) {
      throw new Error([
        "Local GPT Sora did not create a video file.",
        lastMessage.trim(),
        result.stderr.trim()
      ].filter(Boolean).join("\n"));
    }
    return {
      buffer: await readFile(newVideo.path),
      extension: extensionToVideoType(extname(newVideo.path)),
      providerResponse: {
        provider: "local-codex",
        model: input.model,
        codexCommand: command.label,
        generatedVideoPath: newVideo.path,
        message: lastMessage.trim() || undefined
      }
    };
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}

function resolveLocalSoraCommand(): LocalSoraCommand | undefined {
  const command = (process.env.LOCAL_GPT_SORA_BIN ?? process.env.LOCAL_SORA_BIN)?.trim();
  if (!command) {
    return undefined;
  }
  const argsTemplate = parseLocalSoraArgs(
    process.env.LOCAL_GPT_SORA_ARGS ?? process.env.LOCAL_SORA_ARGS
  );
  return {
    command,
    argsTemplate,
    label: command
  };
}

function parseLocalSoraArgs(value: string | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [
      "--prompt-file",
      "{promptFile}",
      "--output",
      "{output}",
      "--duration",
      "{duration}",
      "--resolution",
      "{resolution}",
      "{imageArgs}"
    ];
  }
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      throw new Error("LOCAL_GPT_SORA_ARGS must be a JSON array of strings.");
    }
    return parsed;
  }
  return splitShellLikeArgs(trimmed);
}

function expandLocalSoraArgs(
  argsTemplate: readonly string[],
  context: {
    prompt: string;
    promptPath: string;
    outputPath: string;
    input: LocalCodexVideoGenerationInput;
  }
): string[] {
  const expanded: string[] = [];
  for (const arg of argsTemplate) {
    if (arg === "{images}") {
      expanded.push(...context.input.imagePaths);
      continue;
    }
    if (arg === "{imageArgs}") {
      for (const imagePath of context.input.imagePaths) {
        expanded.push("--image", imagePath);
      }
      continue;
    }
    expanded.push(arg
      .replaceAll("{prompt}", context.prompt)
      .replaceAll("{promptFile}", context.promptPath)
      .replaceAll("{output}", context.outputPath)
      .replaceAll("{duration}", String(context.input.durationSeconds || 4))
      .replaceAll("{resolution}", context.input.resolution || "720p")
      .replace(/\{image(\d+)\}/g, (_match, index: string) => context.input.imagePaths[Number(index)] ?? ""));
  }
  return expanded;
}

function splitShellLikeArgs(value: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let escaping = false;
  for (const char of value) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (escaping) {
    current += "\\";
  }
  if (quote) {
    throw new Error("LOCAL_GPT_SORA_ARGS has an unterminated quote.");
  }
  if (current) {
    args.push(current);
  }
  return args;
}

function shouldUseCodexForLocalSora(): boolean {
  const value = process.env.LOCAL_GPT_SORA_USE_CODEX?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function buildLocalSoraPrompt(input: LocalCodexVideoGenerationInput): string {
  const imageLine = input.imagePaths.length > 0
    ? `Use the attached reference image${input.imagePaths.length > 1 ? "s" : ""} as the visual source. The first image is the first frame. Additional images are reference frames that must guide the motion and identity.`
    : "";
  return [
    input.prompt,
    imageLine,
    `Generate a ${input.durationSeconds || 4}-second video at ${input.resolution || "720p"}.`,
    "Use the local GPT/Sora video generator. Save the final result as an MP4 video file. Do not create source code, HTML, or a mockup."
  ].filter(Boolean).join("\n\n");
}

async function resizeImageToTarget(buffer: Buffer, targetSize: number, keyColor: string): Promise<Buffer> {
  const size = Number.isFinite(targetSize) && targetSize > 0 ? Math.round(targetSize) : 1024;
  return sharp(buffer)
    .resize(size, size, {
      fit: "contain",
      background: keyColor || "#00ff00"
    })
    .png()
    .toBuffer();
}

export function resolveCodexCommand(): CodexCommand {
  const configured = process.env.LOCAL_CODEX_BIN?.trim();
  if (configured) {
    if (configured.endsWith(".js")) {
      return {
        command: process.execPath,
        argsPrefix: [configured],
        label: configured
      };
    }
    return {
      command: configured,
      argsPrefix: [],
      label: configured
    };
  }

  const desktopCodexExe = findDesktopCodexExe();
  if (desktopCodexExe) {
    return {
      command: desktopCodexExe,
      argsPrefix: [],
      label: desktopCodexExe
    };
  }

  const cachedCodexJs = findCachedCodexJs();
  if (cachedCodexJs) {
    return {
      command: process.execPath,
      argsPrefix: [cachedCodexJs],
      label: cachedCodexJs
    };
  }

  return {
    command: "codex",
    argsPrefix: [],
    label: "codex"
  };
}

function findDesktopCodexExe(): string | undefined {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    return undefined;
  }
  const binRoot = join(localAppData, "OpenAI", "Codex", "bin");
  if (!existsSync(binRoot)) {
    return undefined;
  }
  const candidates: GeneratedImageSnapshot[] = [];
  const directExe = join(binRoot, "codex.exe");
  if (existsSync(directExe)) {
    candidates.push({ path: directExe, mtimeMs: statSync(directExe).mtimeMs });
  }
  for (const child of readdirSync(binRoot, { withFileTypes: true })) {
    if (!child.isDirectory()) {
      continue;
    }
    const candidate = join(binRoot, child.name, "codex.exe");
    if (existsSync(candidate)) {
      candidates.push({ path: candidate, mtimeMs: statSync(candidate).mtimeMs });
    }
  }
  return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.path;
}

function findCachedCodexJs(): string | undefined {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    return undefined;
  }
  const npxRoot = join(localAppData, "npm-cache", "_npx");
  if (!existsSync(npxRoot)) {
    return undefined;
  }
  const candidates: GeneratedImageSnapshot[] = [];
  for (const child of readdirSync(npxRoot, { withFileTypes: true })) {
    if (!child.isDirectory()) {
      continue;
    }
    const candidate = join(npxRoot, child.name, "node_modules", "@openai", "codex", "bin", "codex.js");
    if (existsSync(candidate)) {
      candidates.push({ path: candidate, mtimeMs: statSync(candidate).mtimeMs });
    }
  }
  return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.path;
}

function snapshotGeneratedImages(): Set<string> {
  return new Set(readGeneratedImages().map((image) => image.path));
}

function snapshotGeneratedVideos(): Set<string> {
  return new Set(readGeneratedVideos().map((video) => video.path));
}

function findNewestGeneratedImage(before: Set<string>): GeneratedImageSnapshot | undefined {
  return readGeneratedImages()
    .filter((image) => !before.has(image.path))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
}

function findNewestGeneratedVideo(before: Set<string>): GeneratedImageSnapshot | undefined {
  return readGeneratedVideos()
    .filter((video) => !before.has(video.path))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
}

function readGeneratedImages(): GeneratedImageSnapshot[] {
  return readGeneratedFiles(["generated_images"], [".png", ".jpg", ".jpeg", ".webp"]);
}

function readGeneratedVideos(): GeneratedImageSnapshot[] {
  return readGeneratedFiles(["generated_videos", "generated_images"], [".mp4", ".mov", ".webm"]);
}

function readGeneratedFiles(rootNames: readonly string[], extensions: readonly string[]): GeneratedImageSnapshot[] {
  const codexRoot = process.env.CODEX_HOME ?? join(process.env.USERPROFILE ?? "", ".codex");
  const results: GeneratedImageSnapshot[] = [];
  for (const rootName of rootNames) {
    results.push(...readGeneratedFilesFromRoot(join(codexRoot, rootName), extensions));
  }
  return results;
}

function readGeneratedFilesFromRoot(root: string, extensions: readonly string[]): GeneratedImageSnapshot[] {
  if (!existsSync(root)) {
    return [];
  }
  const results: GeneratedImageSnapshot[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) {
      continue;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (extensions.includes(extname(entry.name).toLowerCase())) {
        results.push({
          path: fullPath,
          mtimeMs: statSync(fullPath).mtimeMs
        });
      }
    }
  }
  return results;
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

function runCommand(command: string, args: readonly string[], cwd: string, timeoutLabel = "Local Codex command"): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const timeoutMs = Number(process.env.LOCAL_CODEX_TIMEOUT_MS ?? 10 * 60 * 1000);
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${timeoutLabel} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({ exitCode, stdout, stderr });
    });
  });
}
