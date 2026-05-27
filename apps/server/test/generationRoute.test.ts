import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";

const tempDirs: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeStorageDir() {
  const dir = mkdtempSync(join(tmpdir(), "ai-game-workbench-generation-"));
  tempDirs.push(dir);
  return dir;
}

describe("generation route", () => {
  it("uses an OpenRouter key supplied by the web request header", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "video_job_header_key" }));
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({
      ffmpegPath: "ffmpeg",
      port: 8787,
      storageDir: makeStorageDir()
    });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/generation/video",
      headers: {
        "x-openrouter-api-key": "sk-or-v1-web-key"
      },
      payload: {
        model: "bytedance/seedance-2.0",
        prompt: "正面奔跑循环",
        firstFrameUrl: "https://example.com/hero.png",
        durationSeconds: 4
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: "video_job_header_key" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: "Bearer sk-or-v1-web-key"
      })
    });

    await app.close();
  });

  it("rejects local first-frame URLs before sending them to OpenRouter", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "should_not_be_called" }));
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({
      ffmpegPath: "ffmpeg",
      port: 8787,
      storageDir: makeStorageDir()
    });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/generation/video",
      headers: {
        "x-openrouter-api-key": "sk-or-v1-web-key"
      },
      payload: {
        model: "bytedance/seedance-2.0",
        prompt: "正面奔跑循环",
        firstFrameUrl: "http://127.0.0.1:8787/assets/hero.png",
        durationSeconds: 4
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("公网 HTTPS");
    expect(fetchMock).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns OpenRouter provider errors instead of Fastify internal errors", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: { message: "provider rejected first frame" } }, { status: 400 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = createApp({
      ffmpegPath: "ffmpeg",
      port: 8787,
      storageDir: makeStorageDir()
    });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/generation/video",
      headers: {
        "x-openrouter-api-key": "sk-or-v1-web-key"
      },
      payload: {
        model: "bytedance/seedance-2.0",
        prompt: "正面奔跑循环",
        firstFrameUrl: "https://example.com/hero.png",
        durationSeconds: 4
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: expect.stringContaining("provider rejected first frame"),
      providerStatus: 400
    });

    await app.close();
  });
});
