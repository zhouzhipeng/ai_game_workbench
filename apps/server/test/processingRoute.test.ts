import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeStorageDir() {
  const dir = mkdtempSync(join(tmpdir(), "ai-game-workbench-processing-"));
  tempDirs.push(dir);
  return dir;
}

describe("processing route", () => {
  it("rejects frame processing when the saved source video is missing", async () => {
    const app = createApp({
      ffmpegPath: "ffmpeg",
      port: 8787,
      storageDir: makeStorageDir()
    });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/processing/frames",
      payload: {
        jobId: "missing_job",
        frameCount: 12,
        keyColor: "#00ff00",
        tolerance: 8
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toContain("source.mp4");

    await app.close();
  });
});
