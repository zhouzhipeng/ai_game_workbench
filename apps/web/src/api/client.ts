import type { ProjectState, SavedAnimationKeys } from "@ai-game-workbench/core";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";

export interface UploadedAsset {
  fileName: string;
  storedName: string;
  localPath: string;
  publicUrl: string;
}

export interface CreateVideoGenerationInput {
  model: string;
  prompt: string;
  firstFrameUrl: string;
  durationSeconds: number;
}

export interface GenerationRequestOptions {
  openRouterApiKey?: string;
}

export interface UploadAssetOptions {
  publicAssetBaseUrl?: string;
}

export async function getProject(projectId = "default"): Promise<ProjectState> {
  const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}`);
  if (!response.ok) {
    throw new Error(`Failed to load project: ${response.status}`);
  }
  return response.json() as Promise<ProjectState>;
}

export async function saveProjectKeys(
  projectId: string,
  keys: SavedAnimationKeys
): Promise<ProjectState> {
  const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/keys`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(keys)
  });
  if (!response.ok) {
    throw new Error(`Failed to save project keys: ${response.status}`);
  }
  return response.json() as Promise<ProjectState>;
}

export async function uploadFirstFrameAsset(
  file: File,
  options: UploadAssetOptions = {}
): Promise<UploadedAsset> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE}/api/assets/first-frame`, {
    method: "POST",
    headers: buildUploadHeaders(options),
    body: formData
  });
  if (!response.ok) {
    throw new Error(`上传首帧失败：${response.status}`);
  }
  return response.json() as Promise<UploadedAsset>;
}

function buildUploadHeaders(options: UploadAssetOptions): Record<string, string> | undefined {
  const publicAssetBaseUrl = options.publicAssetBaseUrl?.trim();
  if (!publicAssetBaseUrl) {
    return undefined;
  }
  return {
    "x-public-asset-base-url": publicAssetBaseUrl
  };
}

export async function createVideoGeneration(
  input: CreateVideoGenerationInput,
  options: GenerationRequestOptions = {}
): Promise<unknown> {
  const response = await fetch(`${API_BASE}/api/generation/video`, {
    method: "POST",
    headers: buildGenerationHeaders(options),
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    let message = `视频生成请求失败：${response.status}`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // Keep the status-based message when the body is not JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<unknown>;
}

function buildGenerationHeaders(options: GenerationRequestOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  const apiKey = options.openRouterApiKey?.trim();
  if (apiKey) {
    headers["x-openrouter-api-key"] = apiKey;
  }
  return headers;
}
