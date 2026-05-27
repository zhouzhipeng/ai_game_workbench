import type { FastifyInstance } from "fastify";
import {
  buildImageGenerationPayload,
  buildVideoGenerationPayload,
  OpenRouterError,
  OpenRouterClient
} from "../providers/openRouter";
import type { AppConfig } from "../config";

export function registerGenerationRoutes(app: FastifyInstance, config: AppConfig): void {
  app.post("/api/generation/first-frame/payload", async (request) => {
    return buildImageGenerationPayload(request.body as Parameters<typeof buildImageGenerationPayload>[0]);
  });

  app.post("/api/generation/video/payload", async (request) => {
    return buildVideoGenerationPayload(request.body as Parameters<typeof buildVideoGenerationPayload>[0]);
  });

  app.post("/api/generation/first-frame", async (request, reply) => {
    const apiKey = resolveOpenRouterApiKey(request, config);
    if (!apiKey) {
      return reply.code(400).send({ error: "OPENROUTER_API_KEY is not configured" });
    }
    const client = new OpenRouterClient({ apiKey });
    try {
      return await client.createImage(
        buildImageGenerationPayload(request.body as Parameters<typeof buildImageGenerationPayload>[0])
      );
    } catch (error: unknown) {
      return sendGenerationError(error, reply);
    }
  });

  app.post("/api/generation/video", async (request, reply) => {
    const apiKey = resolveOpenRouterApiKey(request, config);
    if (!apiKey) {
      return reply.code(400).send({ error: "OPENROUTER_API_KEY is not configured" });
    }
    const input = request.body as Parameters<typeof buildVideoGenerationPayload>[0];
    const urlError = validatePublicHttpsImageUrl(input.firstFrameUrl);
    if (urlError) {
      return reply.code(400).send({ error: urlError });
    }
    const client = new OpenRouterClient({ apiKey });
    try {
      return await client.createVideo(buildVideoGenerationPayload(input));
    } catch (error: unknown) {
      return sendGenerationError(error, reply);
    }
  });
}

function resolveOpenRouterApiKey(
  request: { headers: Record<string, string | string[] | undefined> },
  config: AppConfig
): string | undefined {
  const headerValue = request.headers["x-openrouter-api-key"];
  const requestKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const trimmedRequestKey = requestKey?.trim();
  if (trimmedRequestKey) {
    return trimmedRequestKey;
  }
  const configKey = config.openRouterApiKey?.trim();
  return configKey || undefined;
}

function validatePublicHttpsImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "OpenRouter 视频首帧需要公网 HTTPS 图片 URL。";
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "OpenRouter 视频首帧需要公网 HTTPS 图片 URL；当前首帧地址不是有效 URL。";
  }
  if (url.protocol !== "https:") {
    return "OpenRouter 视频首帧需要公网 HTTPS 图片 URL；当前地址不是 HTTPS，127.0.0.1 或本机 HTTP 只能用于网页预览。";
  }
  if (isLocalOrPrivateHost(url.hostname)) {
    return "OpenRouter 视频首帧需要公网 HTTPS 图片 URL；当前地址是本机或内网地址，OpenRouter 云端无法访问。";
  }
  return undefined;
}

function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "::1" || host.startsWith("127.")) {
    return true;
  }
  if (host.startsWith("10.") || host.startsWith("192.168.")) {
    return true;
  }
  const parts = host.split(".").map((part) => Number(part));
  const [first, second] = parts;
  return parts.length === 4 && first === 172 && second !== undefined && second >= 16 && second <= 31;
}

function sendGenerationError(error: unknown, reply: { code: (statusCode: number) => { send: (body: unknown) => unknown } }) {
  if (error instanceof OpenRouterError) {
    return reply.code(error.statusCode).send({
      error: error.message,
      providerStatus: error.statusCode
    });
  }
  throw error;
}
