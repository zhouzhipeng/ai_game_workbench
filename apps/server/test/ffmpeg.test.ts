import { describe, expect, it } from "vitest";
import { buildExtractFramesArgs } from "../src/processing/ffmpeg";

describe("buildExtractFramesArgs", () => {
  it("builds ffmpeg args for extracting frames at a target FPS", () => {
    const args = buildExtractFramesArgs({
      inputPath: "input/video.mp4",
      outputPattern: "frames/raw/frame_%03d.png",
      fps: 12
    });

    expect(args).toEqual([
      "-y",
      "-i",
      "input/video.mp4",
      "-vf",
      "fps=12",
      "frames/raw/frame_%03d.png"
    ]);
  });

  it("builds ffmpeg args for extracting an exact target frame count", () => {
    const args = buildExtractFramesArgs({
      inputPath: "input/video.mp4",
      outputPattern: "frames/raw/frame_%03d.png",
      frameCount: 12,
      durationSeconds: 3
    });

    expect(args).toEqual([
      "-y",
      "-i",
      "input/video.mp4",
      "-vf",
      "fps=4",
      "-frames:v",
      "12",
      "frames/raw/frame_%03d.png"
    ]);
  });
});
