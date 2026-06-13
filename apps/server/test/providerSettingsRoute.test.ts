import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";

const tempDirs: string[] = [];
const originalLocalGptSoraBin = process.env.LOCAL_GPT_SORA_BIN;
const originalLocalSoraBin = process.env.LOCAL_SORA_BIN;
const originalLocalGptSoraUseCodex = process.env.LOCAL_GPT_SORA_USE_CODEX;
const originalLocalComfyUiWorkflowJson = process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON;
const originalLocalComfyUiWorkflow = process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW;
const originalLocalComfyUiDisableDefaults = process.env.LOCAL_COMFYUI_VIDEO_DISABLE_DEFAULTS;

afterEach(() => {
  restoreEnv("LOCAL_GPT_SORA_BIN", originalLocalGptSoraBin);
  restoreEnv("LOCAL_SORA_BIN", originalLocalSoraBin);
  restoreEnv("LOCAL_GPT_SORA_USE_CODEX", originalLocalGptSoraUseCodex);
  restoreEnv("LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON", originalLocalComfyUiWorkflowJson);
  restoreEnv("LOCAL_COMFYUI_VIDEO_WORKFLOW", originalLocalComfyUiWorkflow);
  restoreEnv("LOCAL_COMFYUI_VIDEO_DISABLE_DEFAULTS", originalLocalComfyUiDisableDefaults);
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeStorageDir() {
  const dir = mkdtempSync(join(tmpdir(), "ai-game-workbench-provider-settings-"));
  tempDirs.push(dir);
  return dir;
}

describe("provider settings routes", () => {
  it("publishes enabled provider models with APIMart defaults", async () => {
    delete process.env.LOCAL_GPT_SORA_BIN;
    delete process.env.LOCAL_SORA_BIN;
    delete process.env.LOCAL_GPT_SORA_USE_CODEX;
    delete process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON;
    delete process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW;
    process.env.LOCAL_COMFYUI_VIDEO_DISABLE_DEFAULTS = "1";
    const app = createApp({
      ffmpegPath: "ffmpeg",
      port: 8787,
      storageDir: makeStorageDir()
    });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/provider-models"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().imageModels.map((model: { id: string }) => model.id)).toEqual([
      "local/gpt-image-2",
      "google/gemini-3.1-flash-image-preview",
      "openrouter/gpt-image-2",
      "apimart/gpt-image-2",
      "apimart/nano-banana-2"
    ]);
    expect(response.json().videoModels.map((model: { id: string }) => model.id)).toEqual([
      "bytedance/seedance-2.0",
      "apimart/seedance-2.0",
      "apimart/seedance-1.0-pro-quality"
    ]);
    expect(response.json()).toMatchObject({
      defaults: {
        imageModelId: "apimart/gpt-image-2",
        videoModelId: "apimart/seedance-2.0"
      },
      imageModels: expect.arrayContaining([
        expect.objectContaining({
          id: "apimart/gpt-image-2",
          providerId: "apimart",
          upstreamModel: "gpt-image-2",
          label: "GPT-Image-2"
        }),
        expect.objectContaining({
          id: "openrouter/gpt-image-2",
          providerId: "openrouter",
          upstreamModel: "openai/gpt-image-2",
          label: "GPT-Image-2"
        })
      ])
    });

    await app.close();
  });

  it("publishes Local GPT Sora only when a local generator is configured", async () => {
    process.env.LOCAL_GPT_SORA_BIN = process.execPath;
    delete process.env.LOCAL_SORA_BIN;
    delete process.env.LOCAL_GPT_SORA_USE_CODEX;
    const app = createApp({
      ffmpegPath: "ffmpeg",
      port: 8787,
      storageDir: makeStorageDir()
    });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/provider-models"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().videoModels.map((model: { id: string }) => model.id)).toContain("local/gpt-sora");

    await app.close();
  });

  it("publishes ComfyUI workflow video only when a workflow is configured", async () => {
    process.env.LOCAL_COMFYUI_VIDEO_WORKFLOW_JSON = JSON.stringify({
      "1": {
        class_type: "LoadImage",
        inputs: {
          image: "{{inputImage}}"
        }
      }
    });
    const app = createApp({
      ffmpegPath: "ffmpeg",
      port: 8787,
      storageDir: makeStorageDir()
    });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/provider-models"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().videoModels.map((model: { id: string }) => model.id)).toContain("local/comfyui-video-workflow");

    await app.close();
  });

  it("requires the admin token for provider settings and never returns full secrets", async () => {
    const storageDir = makeStorageDir();
    const app = createApp({
      ffmpegPath: "ffmpeg",
      port: 8787,
      adminSettingsToken: "admin-test-token",
      storageDir
    });
    await app.ready();

    const missingTokenResponse = await app.inject({
      method: "GET",
      url: "/api/admin/provider-settings"
    });
    const wrongTokenResponse = await app.inject({
      method: "GET",
      url: "/api/admin/provider-settings",
      headers: {
        "x-admin-settings-token": "wrong-token"
      }
    });
    const saveResponse = await app.inject({
      method: "PUT",
      url: "/api/admin/provider-settings",
      headers: {
        "x-admin-settings-token": "admin-test-token"
      },
      payload: {
        providers: [
          {
            id: "apimart",
            label: "APIMart",
            kind: "apimart",
            enabled: true,
            baseUrl: "https://api.apimart.ai/v1"
          }
        ],
        models: [
          {
            id: "apimart/gpt-image-2",
            providerId: "apimart",
            upstreamModel: "gpt-image-2",
            label: "APIMart GPT-Image-2",
            capability: "image",
            enabled: true,
            imageSizeOptions: [{ size: 1024, label: "1024 x 1024" }],
            defaultImageSize: 1024
          }
        ],
        defaults: {
          imageModelId: "apimart/gpt-image-2",
          videoModelId: "bytedance/seedance-2.0"
        },
        secrets: {
          "apimart": {
            apiKey: "test-compatible-secret-tail"
          }
        }
      }
    });
    const readResponse = await app.inject({
      method: "GET",
      url: "/api/admin/provider-settings",
      headers: {
        "x-admin-settings-token": "admin-test-token"
      }
    });

    expect(missingTokenResponse.statusCode).toBe(401);
    expect(wrongTokenResponse.statusCode).toBe(401);
    expect(saveResponse.statusCode).toBe(200);
    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.json().secrets.apimart).toEqual({ configured: true, suffix: "tail" });
    expect(JSON.stringify(readResponse.json())).not.toContain("test-compatible-secret-tail");

    await app.close();
  });

  it("reports a missing admin token configuration before allowing settings writes", async () => {
    const app = createApp({
      ffmpegPath: "ffmpeg",
      port: 8787,
      storageDir: makeStorageDir()
    });
    await app.ready();

    const response = await app.inject({
      method: "PUT",
      url: "/api/admin/provider-settings",
      headers: {
        "x-admin-settings-token": "admin-test-token"
      },
      payload: {}
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error).toContain("ADMIN_SETTINGS_TOKEN");

    await app.close();
  });

  it("reads provider secret files that include a UTF-8 BOM", async () => {
    const storageDir = makeStorageDir();
    mkdirSync(join(storageDir, "config"), { recursive: true });
    writeFileSync(
      join(storageDir, "config", "provider-secrets.json"),
      `\uFEFF${JSON.stringify({ apiKeys: { apimart: "test-compatible-bom-tail" } })}`,
      "utf8"
    );
    const app = createApp({
      ffmpegPath: "ffmpeg",
      port: 8787,
      adminSettingsToken: "admin-test-token",
      storageDir
    });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/provider-settings",
      headers: {
        "x-admin-settings-token": "admin-test-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().secrets.apimart).toEqual({ configured: true, suffix: "tail" });
    expect(JSON.stringify(response.json())).not.toContain("test-compatible-bom-tail");

    await app.close();
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
