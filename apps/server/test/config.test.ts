import ffmpegStaticPath from "ffmpeg-static";
import { describe, expect, it } from "vitest";
import { loadConfig, resolveDefaultFfmpegPath } from "../src/config";

describe("server config", () => {
  it("uses the bundled ffmpeg-static binary when FFMPEG_PATH is not set", () => {
    expect(resolveDefaultFfmpegPath()).toBe(ffmpegStaticPath);
    expect(loadConfig({}).ffmpegPath).toBe(ffmpegStaticPath);
  });

  it("lets FFMPEG_PATH override the bundled binary", () => {
    expect(loadConfig({ FFMPEG_PATH: "custom-ffmpeg" }).ffmpegPath).toBe("custom-ffmpeg");
  });
});
