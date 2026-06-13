import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateLocalComfyUiVideo, isLocalComfyUiVideoConfigured } from "../src/providers/comfyUiVideo";

const originalWorkflowJson = process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON;
const originalWorkflowPath = process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW;
const originalComfyUrl = process.env.LOCAL_COMFYUI_URL;
const originalFps = process.env.LOCAL_COMFYUI_VIDEO_FPS;
const originalDisableDefaults = process.env.LOCAL_COMFYUI_VIDEO_DISABLE_DEFAULTS;
const originalComfyBaseDir = process.env.LOCAL_COMFYUI_BASE_DIR;
const originalExactSheetMode = process.env.LOCAL_COMFYUI_VIDEO_EXACT_SHEET_MODE;
const tempDirs: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  restoreEnv("LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON", originalWorkflowJson);
  restoreEnv("LOCAL_COMFYUI_VIDEO_WORKFLOW", originalWorkflowPath);
  restoreEnv("LOCAL_COMFYUI_URL", originalComfyUrl);
  restoreEnv("LOCAL_COMFYUI_VIDEO_FPS", originalFps);
  restoreEnv("LOCAL_COMFYUI_VIDEO_DISABLE_DEFAULTS", originalDisableDefaults);
  restoreEnv("LOCAL_COMFYUI_BASE_DIR", originalComfyBaseDir);
  restoreEnv("LOCAL_COMFYUI_VIDEO_EXACT_SHEET_MODE", originalExactSheetMode);
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("ComfyUI video provider", () => {
  it("is configured only when a workflow is available", () => {
    delete process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON;
    delete process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW;
    process.env.LOCAL_COMFYUI_VIDEO_DISABLE_DEFAULTS = "1";

    expect(isLocalComfyUiVideoConfigured()).toBe(false);

    process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON = JSON.stringify({ "1": { class_type: "SaveVideo", inputs: {} } });

    expect(isLocalComfyUiVideoConfigured()).toBe(true);
  });

  it("detects the default Wan2.2 workflow under the configured ComfyUI base directory", () => {
    const root = mkdtempSync(join(tmpdir(), "ai-game-workbench-comfyui-base-"));
    tempDirs.push(root);
    const workflowDir = join(root, "user", "default", "workflows");
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(join(workflowDir, "ai-game-workbench-wan22-ti2v-api.json"), JSON.stringify({
      "1": {
        class_type: "SaveVideo",
        inputs: {}
      }
    }));
    delete process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON;
    delete process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW;
    delete process.env.LOCAL_COMFYUI_VIDEO_DISABLE_DEFAULTS;
    process.env.LOCAL_COMFYUI_BASE_DIR = root;

    expect(isLocalComfyUiVideoConfigured()).toBe(true);
  });

  it("keeps the default LTXV workflow as a fallback", () => {
    const root = mkdtempSync(join(tmpdir(), "ai-game-workbench-comfyui-base-"));
    tempDirs.push(root);
    const workflowDir = join(root, "user", "default", "workflows");
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(join(workflowDir, "ai-game-workbench-ltxv-i2v-api.json"), JSON.stringify({
      "1": {
        class_type: "SaveVideo",
        inputs: {}
      }
    }));
    delete process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON;
    delete process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW;
    delete process.env.LOCAL_COMFYUI_VIDEO_DISABLE_DEFAULTS;
    process.env.LOCAL_COMFYUI_BASE_DIR = root;

    expect(isLocalComfyUiVideoConfigured()).toBe(true);
  });

  it("submits a workflow with placeholders and downloads the generated video", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-game-workbench-comfyui-video-"));
    tempDirs.push(root);
    const imagePath = join(root, "first-frame.png");
    const referencePath = join(root, "reference.png");
    writeFileSync(imagePath, "png");
    writeFileSync(referencePath, "png");
    process.env.LOCAL_COMFYUI_URL = "http://127.0.0.1:8000/";
    process.env.LOCAL_COMFYUI_VIDEO_FPS = "12";
    process.env.LOCAL_COMFYUI_VIDEO_EXACT_SHEET_MODE = "off";
    process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON = JSON.stringify({
      "1": {
        class_type: "LoadImage",
        inputs: {
          image: "{{inputImage}}"
        }
      },
      "2": {
        class_type: "SomeVideoNode",
        inputs: {
          prompt: "{{prompt}}",
          width: "{{width}}",
          height: "{{height}}",
          frames: "{{frames}}",
          fps: "{{fps}}",
          image: ["1", 0]
        }
      },
      "3": {
        class_type: "SaveVideo",
        inputs: {
          filename_prefix: "{{filenamePrefix}}",
          video: ["2", 0]
        }
      },
      "4": {
        class_type: "LoadImage",
        inputs: {
          image: "{{inputImage1}}"
        }
      }
    });
    let uploadCount = 0;
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlText = String(url);
      if (urlText.endsWith("/upload/image")) {
        uploadCount += 1;
        return Response.json({
          name: uploadCount === 1 ? "first-frame.png" : "reference.png",
          subfolder: "ai-game-workbench",
          type: "input"
        });
      }
      if (urlText.endsWith("/prompt")) {
        const body = JSON.parse(String(init?.body)) as { prompt: Record<string, { inputs: Record<string, unknown> }> };
        expect(body.prompt["1"]?.inputs.image).toBe("ai-game-workbench/first-frame.png");
        expect(body.prompt["4"]?.inputs.image).toBe("ai-game-workbench/reference.png");
        expect(body.prompt["2"]?.inputs.prompt).toBe("walk cycle");
        expect(body.prompt["2"]?.inputs.width).toBe(512);
        expect(body.prompt["2"]?.inputs.height).toBe(512);
        expect(body.prompt["2"]?.inputs.frames).toBe(49);
        expect(body.prompt["2"]?.inputs.fps).toBe(12);
        return Response.json({ prompt_id: "prompt-1" });
      }
      if (urlText.endsWith("/history/prompt-1")) {
        return Response.json({
          "prompt-1": {
            status: { status_str: "success", completed: true },
            outputs: {
              "3": {
                gifs: [{ filename: "walk.mp4", subfolder: "video", type: "output" }]
              }
            }
          }
        });
      }
      if (urlText.includes("/view?")) {
        return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]));
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateLocalComfyUiVideo({
      model: "local/comfyui-video-workflow",
      prompt: "walk cycle",
      durationSeconds: 4,
      resolution: "512x512",
      imagePaths: [imagePath, referencePath],
      workingDirectory: root
    });

    expect(uploadCount).toBe(2);
    expect(result.extension).toBe("mp4");
    expect([...result.buffer]).toEqual([0, 0, 0, 24, 102, 116, 121, 112]);
    expect(result.providerResponse).toMatchObject({
      provider: "local-comfyui",
      promptId: "prompt-1"
    });
  });

  it("can generate an exact sprite sheet video without submitting a ComfyUI prompt", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-game-workbench-exact-sheet-test-"));
    tempDirs.push(root);
    const imagePath = join(root, "walk-4dir.png");
    writeFileSync(imagePath, await makeFourDirectionSheet());
    process.env.LOCAL_COMFYUI_URL = "http://127.0.0.1:8000/";
    process.env.LOCAL_COMFYUI_VIDEO_FPS = "4";
    process.env.LOCAL_COMFYUI_VIDEO_EXACT_SHEET_MODE = "always";
    process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON = JSON.stringify({
      "1": {
        class_type: "SaveVideo",
        inputs: {}
      }
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateLocalComfyUiVideo({
      model: "local/comfyui-video-workflow",
      prompt: "walk cycle",
      durationSeconds: 2,
      resolution: "64x64",
      imagePaths: [imagePath],
      workingDirectory: root,
      ffmpegPath: ffmpegStaticPath || "ffmpeg"
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.extension).toBe("mp4");
    expect(result.buffer.includes(Buffer.from("ftyp"))).toBe(true);
    expect(result.providerResponse).toMatchObject({
      provider: "local-comfyui",
      mode: "exact-sheet-preserve",
      frameCount: 9,
      resolution: "64x64"
    });
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function makeFourDirectionSheet(): Promise<Buffer> {
  const block = async (color: string) =>
    sharp({
      create: {
        width: 10,
        height: 18,
        channels: 4,
        background: color
      }
    }).png().toBuffer();
  return sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: { r: 0, g: 255, b: 0, alpha: 1 }
    }
  }).composite([
    { input: await block("#ff0000"), left: 11, top: 8 },
    { input: await block("#0000ff"), left: 43, top: 8 },
    { input: await block("#ffffff"), left: 11, top: 40 },
    { input: await block("#000000"), left: 43, top: 40 }
  ]).png().toBuffer();
}
