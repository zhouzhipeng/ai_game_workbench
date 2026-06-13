import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateLocalComfyUiVideo, isLocalComfyUiVideoConfigured } from "../src/providers/comfyUiVideo";

const originalWorkflowJson = process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON;
const originalWorkflowPath = process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW;
const originalComfyUrl = process.env.LOCAL_COMFYUI_URL;
const originalFps = process.env.LOCAL_COMFYUI_VIDEO_FPS;
const tempDirs: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  restoreEnv("LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON", originalWorkflowJson);
  restoreEnv("LOCAL_COMFYUI_VIDEO_WORKFLOW", originalWorkflowPath);
  restoreEnv("LOCAL_COMFYUI_URL", originalComfyUrl);
  restoreEnv("LOCAL_COMFYUI_VIDEO_FPS", originalFps);
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("ComfyUI video provider", () => {
  it("is configured only when a workflow is available", () => {
    delete process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON;
    delete process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW;

    expect(isLocalComfyUiVideoConfigured()).toBe(false);

    process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON = JSON.stringify({ "1": { class_type: "SaveVideo", inputs: {} } });

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
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
