import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config";

type StorageRouteConfig = Pick<AppConfig, "storageDir">;

export function registerStorageRoutes(app: FastifyInstance, config: StorageRouteConfig): void {
  app.post("/api/storage/open-directory", async () => {
    await mkdir(config.storageDir, { recursive: true });
    await openDirectory(config.storageDir);
    return {
      ok: true,
      storageDir: config.storageDir
    };
  });
}

async function openDirectory(directory: string): Promise<void> {
  const { command, args } = getOpenDirectoryCommand(directory);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function getOpenDirectoryCommand(directory: string): { command: string; args: string[] } {
  if (process.platform === "win32") {
    return { command: "explorer.exe", args: [directory] };
  }

  if (process.platform === "darwin") {
    return { command: "open", args: [directory] };
  }

  return { command: "xdg-open", args: [directory] };
}
