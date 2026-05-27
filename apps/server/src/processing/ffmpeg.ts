import { spawn } from "node:child_process";

export interface ExtractFramesInput {
  inputPath: string;
  outputPattern: string;
  fps?: number;
  frameCount?: number;
  durationSeconds?: number;
}

export function buildExtractFramesArgs(input: ExtractFramesInput): string[] {
  const fps = input.frameCount && input.durationSeconds
    ? input.frameCount / input.durationSeconds
    : input.fps;
  if (!fps || !Number.isFinite(fps) || fps <= 0) {
    throw new Error("A positive fps or frameCount with durationSeconds is required");
  }
  const args = ["-y", "-i", input.inputPath, "-vf", `fps=${formatFps(fps)}`];
  if (input.frameCount) {
    args.push("-frames:v", String(input.frameCount));
  }
  args.push(input.outputPattern);
  return args;
}

export async function extractFramesWithFfmpeg(
  ffmpegPath: string,
  input: ExtractFramesInput
): Promise<void> {
  await runFfmpeg(ffmpegPath, buildExtractFramesArgs(input));
}

export async function runFfmpeg(ffmpegPath: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, [...args], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with ${code}: ${stderr}`));
    });
  });
}

export async function probeVideoDurationSeconds(ffmpegPath: string, inputPath: string): Promise<number> {
  const stderr = await collectFfmpegOutput(ffmpegPath, ["-hide_banner", "-i", inputPath]);
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!match) {
    throw new Error("Cannot read video duration from ffmpeg output");
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

function collectFfmpegOutput(ffmpegPath: string, args: readonly string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(ffmpegPath, [...args], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";

    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });

    child.on("error", reject);
    child.on("close", () => resolve(output));
  });
}

function formatFps(fps: number): string {
  if (Number.isInteger(fps)) {
    return String(fps);
  }
  return fps.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}
