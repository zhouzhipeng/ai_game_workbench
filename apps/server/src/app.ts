import cors from "@fastify/cors";
import Fastify from "fastify";
import { createProjectStore } from "./storage/projectStore";
import { registerProjectRoutes } from "./routes/projects";

export interface CreateAppOptions {
  storageDir: string;
}

export function createApp(options: CreateAppOptions) {
  const app = Fastify({ logger: false });
  const projectStore = createProjectStore({ storageDir: options.storageDir });

  void app.register(cors, { origin: true });

  app.get("/api/health", async () => ({ ok: true }));
  registerProjectRoutes(app, projectStore);

  return app;
}
