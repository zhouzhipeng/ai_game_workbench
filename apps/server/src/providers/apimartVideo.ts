export interface BuildApimartVideoGenerationPayloadInput {
  model: string;
  prompt: string;
  firstFrameUrl: string;
  lastFrameUrl?: string;
  referenceOnly?: boolean;
  inputReferenceUrls?: readonly string[];
  durationSeconds?: number;
  resolution?: string;
}

export interface ApimartVideoClientOptions {
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class ApimartVideoError extends Error {
  readonly statusCode: number;
  readonly responseBody: string;

  constructor(statusCode: number, responseBody: string, message: string) {
    super(message);
    this.name = "ApimartVideoError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export function buildApimartVideoGenerationPayload(input: BuildApimartVideoGenerationPayloadInput) {
  const referenceUrls = (input.inputReferenceUrls ?? []).map((url) => url.trim()).filter(Boolean);
  const firstFrameUrl = input.firstFrameUrl.trim();
  const lastFrameUrl = input.lastFrameUrl?.trim();
  return {
    model: input.model,
    prompt: input.prompt,
    resolution: input.resolution ?? "720p",
    size: "adaptive",
    duration: input.durationSeconds ?? 5,
    generate_audio: false,
    ...(lastFrameUrl ? {
      image_with_roles: [
        { url: firstFrameUrl, role: "first_frame" },
        { url: lastFrameUrl, role: "last_frame" }
      ]
    } : {
      image_urls: input.referenceOnly && referenceUrls.length > 0
        ? referenceUrls
        : [firstFrameUrl, ...referenceUrls]
    })
  };
}

export class ApimartVideoClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApimartVideoClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createVideo(payload: ReturnType<typeof buildApimartVideoGenerationPayload>): Promise<unknown> {
    const response = await this.postJson("/videos/generations", payload);
    const taskId = extractTaskId(response);
    const status = extractStatus(response);
    return {
      ...asRecord(response),
      ...(taskId ? { id: taskId, jobId: taskId } : {}),
      status
    };
  }

  async getVideoJob(jobId: string): Promise<unknown> {
    const response = await this.getJson(`/tasks/${encodeURIComponent(jobId)}?language=zh`);
    return {
      ...asRecord(response),
      jobId,
      status: extractStatus(response),
      videoUrl: extractVideoUrl(response)
    };
  }

  private async postJson(path: string, body: unknown): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body)
    });
    return parseJsonResponse(response);
  }

  private async getJson(path: string): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: this.headers()
    });
    return parseJsonResponse(response);
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json"
    };
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const body = await response.text();
  const parsed = parseJsonBody(body);
  if (!response.ok) {
    throw new ApimartVideoError(response.status, body, extractErrorMessage(parsed) ?? `APIMart video API request failed (${response.status})`);
  }
  return parsed;
}

function parseJsonBody(body: string): unknown {
  if (!body) {
    return null;
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function extractTaskId(value: unknown): string | undefined {
  return findStringValue(value, ["task_id", "taskId", "id"]);
}

function extractStatus(value: unknown): string {
  return findStringValue(value, ["status", "state"])?.toLowerCase() ?? "pending";
}

function extractVideoUrl(value: unknown): string | undefined {
  return findStringValue(value, ["videoUrl", "video_url", "url"]);
}

function extractErrorMessage(value: unknown): string | undefined {
  const direct = findStringValue(value, ["message", "error"]);
  if (direct) {
    return direct;
  }
  if (value && typeof value === "object") {
    return extractErrorMessage((value as Record<string, unknown>).error);
  }
  return undefined;
}

function findStringValue(value: unknown, keys: readonly string[]): string | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringValue(item, keys);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  if (typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const item = record[key];
    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }
    if (Array.isArray(item)) {
      const found = item.find((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
      if (found) {
        return found.trim();
      }
    }
  }
  for (const key of ["data", "result", "videos", "video", "error"]) {
    const found = findStringValue(record[key], keys);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : { providerResponse: value };
}
