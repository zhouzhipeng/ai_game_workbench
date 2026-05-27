import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  applyColorKeyToBuffer,
  buildSpriteSheetFromBuffers,
  resizeNearestBuffer
} from "../processing/imageProcessing";
import {
  extractFramesWithFfmpeg,
  probeVideoDurationSeconds
} from "../processing/ffmpeg";
import type { AppConfig } from "../config";

type ProcessingRouteConfig = Pick<AppConfig, "storageDir" | "ffmpegPath">;

export function registerProcessingRoutes(app: FastifyInstance, config: ProcessingRouteConfig): void {
  app.get("/api/processing/capabilities", async () => ({
    colorKey: true,
    resizeNearest: true,
    spriteSheet: true,
    formats: ["png", "gif"]
  }));

  app.decorate("spriteProcessing", {
    applyColorKeyToBuffer,
    resizeNearestBuffer,
    buildSpriteSheetFromBuffers
  });

  app.post("/api/processing/frames", async (request, reply) => {
    const input = request.body as {
      jobId?: string;
      frameCount?: number;
      keyColor?: string;
      tolerance?: number;
    };
    const jobId = input.jobId?.trim();
    if (!jobId || !/^[a-zA-Z0-9_-]+$/.test(jobId)) {
      return reply.code(400).send({ error: "有效的视频任务 ID 是必填项。" });
    }
    const frameCount = clampFrameCount(input.frameCount);
    const keyColor = input.keyColor ?? "#00ff00";
    const tolerance = clampTolerance(input.tolerance);
    const jobDir = join(config.storageDir, "jobs", jobId);
    const sourcePath = join(jobDir, "source.mp4");
    if (!existsSync(sourcePath)) {
      return reply.code(404).send({ error: `缺少视频源文件：storage/jobs/${jobId}/source.mp4` });
    }

    const rawDir = join(jobDir, "frames", "raw");
    const transparentDir = join(jobDir, "frames", "transparent");
    await rm(rawDir, { recursive: true, force: true });
    await rm(transparentDir, { recursive: true, force: true });
    await mkdir(rawDir, { recursive: true });
    await mkdir(transparentDir, { recursive: true });

    const durationSeconds = await probeVideoDurationSeconds(config.ffmpegPath, sourcePath);
    await extractFramesWithFfmpeg(config.ffmpegPath, {
      inputPath: sourcePath,
      outputPattern: join(rawDir, "frame_%03d.png"),
      frameCount,
      durationSeconds
    });

    const rawFrames = (await readdir(rawDir))
      .filter((fileName) => fileName.toLowerCase().endsWith(".png"))
      .sort()
      .slice(0, frameCount);
    const frames = [];
    for (const [index, fileName] of rawFrames.entries()) {
      const frameNumber = index + 1;
      const outputName = `frame_${String(frameNumber).padStart(3, "0")}.png`;
      const keyed = await applyColorKeyToBuffer(await readFile(join(rawDir, fileName)), keyColor, tolerance);
      await writeFile(join(transparentDir, outputName), keyed);
      frames.push({
        index: frameNumber,
        url: `/jobs/${jobId}/frames/transparent/${outputName}`
      });
    }

    return {
      jobId,
      frameCount: frames.length,
      frames
    };
  });
}

function clampFrameCount(value: unknown): number {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 12;
  return Math.max(1, Math.min(120, count));
}

function clampTolerance(value: unknown): number {
  const tolerance = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 8;
  return Math.max(0, Math.min(255, tolerance));
}
