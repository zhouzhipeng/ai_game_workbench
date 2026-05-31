import cors from "@fastify/cors";
import Fastify from "fastify";
import { createProjectStore } from "./storage/projectStore";
import { registerProjectRoutes } from "./routes/projects";
import { registerAssetRoutes } from "./routes/assets";
import { registerGenerationRoutes } from "./routes/generation";
import { registerProcessingRoutes } from "./routes/processing";
import { registerCharacterRoutes } from "./routes/characters";
import { registerWorkflowConfigRoutes } from "./routes/workflowConfig";
import { registerOneClickCharacterRoutes, type OneClickCharacterJobRunner } from "./routes/oneClickCharacterJobs";
import { resolveDefaultFfmpegPath, type AppConfig } from "./config";

export type CreateAppOptions = Pick<AppConfig, "storageDir"> & Partial<AppConfig> & {
  oneClickCharacterJobRunner?: OneClickCharacterJobRunner;
};

const GENERATION_BODY_LIMIT_BYTES = 64 * 1024 * 1024;

export function createApp(options: CreateAppOptions) {
  const app = Fastify({
    logger: false,
    bodyLimit: GENERATION_BODY_LIMIT_BYTES
  });
  const projectStore = createProjectStore({ storageDir: options.storageDir });
  const ffmpegPath = options.ffmpegPath ?? resolveDefaultFfmpegPath();

  void app.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"]
  });

  app.get("/api/health", async () => ({ ok: true }));
  registerWorkflowConfigRoutes(app, {
    storageDir: options.storageDir
  });
  registerCharacterRoutes(app, {
    storageDir: options.storageDir
  });
  registerProjectRoutes(app, projectStore);
  registerAssetRoutes(app, {
    port: options.port ?? 8787,
    storageDir: options.storageDir,
    publicAssetBaseUrl: options.publicAssetBaseUrl
  });
  registerGenerationRoutes(app, {
    ffmpegPath,
    port: options.port ?? 8787,
    storageDir: options.storageDir,
    openRouterApiKey: options.openRouterApiKey,
    publicAssetBaseUrl: options.publicAssetBaseUrl,
    localCodexImageGenerator: options.localCodexImageGenerator
  });
  registerProcessingRoutes(app, {
    ffmpegPath,
    storageDir: options.storageDir
  });
  registerOneClickCharacterRoutes(app, {
    ffmpegPath,
    storageDir: options.storageDir,
    openRouterApiKey: options.openRouterApiKey,
    publicAssetBaseUrl: options.publicAssetBaseUrl,
    oneClickCharacterJobRunner: options.oneClickCharacterJobRunner
  });

  return app;
}
