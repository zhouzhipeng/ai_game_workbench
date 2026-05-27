import type { FastifyInstance } from "fastify";
import type { SavedAnimationKeys } from "@ai-game-workbench/core";
import type { ProjectStore } from "../storage/projectStore";

export function registerProjectRoutes(app: FastifyInstance, store: ProjectStore): void {
  app.get("/api/projects/:projectId", async (request) => {
    const { projectId } = request.params as { projectId: string };
    return store.getOrCreateProject(projectId);
  });

  app.put("/api/projects/:projectId/keys", async (request) => {
    const { projectId } = request.params as { projectId: string };
    const keys = request.body as SavedAnimationKeys;
    return store.saveProjectKeys(projectId, keys);
  });
}
