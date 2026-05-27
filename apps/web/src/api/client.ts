import type { ProjectState, SavedAnimationKeys } from "@ai-game-workbench/core";

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";

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
  durationSeconds?: number;
}

export interface CreateFirstFrameGenerationInput {
  model: string;
  prompt: string;
  targetSize: number;
  keyColor: string;
  direction: string;
  referenceImageDataUrl?: string;
}

export interface VideoJobStatus {
  jobId: string;
  status: string;
  videoUrl?: string;
  localVideoUrl?: string;
  providerResponse?: unknown;
}

export interface ProcessFramesInput {
  jobId: string;
  frameCount: number;
  keyColor: string;
  tolerance: number;
}

export interface ProcessedFrame {
  index: number;
  url: string;
}

export interface ProcessFramesResult {
  jobId: string;
  frameCount: number;
  frames: ProcessedFrame[];
}

export interface GenerationRequestOptions {
  openRouterApiKey?: string;
  publicAssetBaseUrl?: string;
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

export async function createFirstFrameGeneration(
  input: CreateFirstFrameGenerationInput,
  options: GenerationRequestOptions = {}
): Promise<unknown> {
  const response = await fetch(`${API_BASE}/api/generation/first-frame`, {
    method: "POST",
    headers: buildGenerationHeaders(options),
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `首帧处理请求失败：${response.status}`));
  }
  return response.json() as Promise<unknown>;
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
    throw new Error(await readErrorMessage(response, `视频生成请求失败：${response.status}`));
  }
  return response.json() as Promise<unknown>;
}

export async function getVideoGenerationStatus(
  jobId: string,
  options: GenerationRequestOptions = {}
): Promise<VideoJobStatus> {
  const response = await fetch(`${API_BASE}/api/generation/video/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: buildGenerationHeaders(options)
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `视频状态查询失败：${response.status}`));
  }
  return response.json() as Promise<VideoJobStatus>;
}

export async function processVideoFrames(input: ProcessFramesInput): Promise<ProcessFramesResult> {
  const response = await fetch(`${API_BASE}/api/processing/frames`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `帧处理失败：${response.status}`));
  }
  return response.json() as Promise<ProcessFramesResult>;
}

export function toAbsoluteApiUrl(url: string): string {
  if (/^https?:\/\//i.test(url) || url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

function buildGenerationHeaders(options: GenerationRequestOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  const apiKey = options.openRouterApiKey?.trim();
  if (apiKey) {
    headers["x-openrouter-api-key"] = apiKey;
  }
  const publicAssetBaseUrl = options.publicAssetBaseUrl?.trim();
  if (publicAssetBaseUrl) {
    headers["x-public-asset-base-url"] = publicAssetBaseUrl;
  }
  return headers;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}
