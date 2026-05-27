import type { FastifyInstance } from "fastify";
import {
  buildImageGenerationPayload,
  buildVideoGenerationPayload,
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
    return client.createImage(
      buildImageGenerationPayload(request.body as Parameters<typeof buildImageGenerationPayload>[0])
    );
  });

  app.post("/api/generation/video", async (request, reply) => {
    const apiKey = resolveOpenRouterApiKey(request, config);
    if (!apiKey) {
      return reply.code(400).send({ error: "OPENROUTER_API_KEY is not configured" });
    }
    const client = new OpenRouterClient({ apiKey });
    return client.createVideo(
      buildVideoGenerationPayload(request.body as Parameters<typeof buildVideoGenerationPayload>[0])
    );
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
