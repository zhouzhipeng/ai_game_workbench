import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";

const MODULE01_WORKFLOW_CONFIG_PATH = ["config", "module01-workflow.json"] as const;

export function registerWorkflowConfigRoutes(
  app: FastifyInstance,
  options: { storageDir: string }
): void {
  app.get("/api/module01/workflow-config", async () => ({
    config: await readModule01WorkflowConfig(options.storageDir)
  }));

  app.put("/api/module01/workflow-config", async (request, reply) => {
    const config = request.body;
    if (!isPlainObject(config)) {
      return reply.code(400).send({ error: "workflow config must be an object" });
    }
    await writeModule01WorkflowConfig(options.storageDir, config);
    return { config };
  });
}

export async function readModule01WorkflowConfig(storageDir: string): Promise<Record<string, unknown> | null> {
  const path = resolveModule01WorkflowConfigPath(storageDir);
  if (!existsSync(path)) {
    return null;
  }
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return isPlainObject(parsed) ? parsed : null;
}

export async function writeModule01WorkflowConfig(
  storageDir: string,
  config: Record<string, unknown>
): Promise<void> {
  const path = resolveModule01WorkflowConfigPath(storageDir);
  await mkdir(join(storageDir, "config"), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function resolveModule01WorkflowConfigPath(storageDir: string): string {
  return join(storageDir, ...MODULE01_WORKFLOW_CONFIG_PATH);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
