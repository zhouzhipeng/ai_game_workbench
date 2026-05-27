import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config";

type AssetRouteConfig = Pick<AppConfig, "storageDir" | "publicAssetBaseUrl" | "port">;

export function registerAssetRoutes(app: FastifyInstance, config: AssetRouteConfig): void {
  const assetDir = join(config.storageDir, "assets");
  mkdirSync(assetDir, { recursive: true });

  void app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 1
    }
  });
  void app.register(fastifyStatic, {
    root: assetDir,
    prefix: "/assets/"
  });

  app.post("/api/assets/first-frame", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "file is required" });
    }
    if (!file.mimetype.startsWith("image/")) {
      return reply.code(400).send({ error: "only image files are supported" });
    }

    const extension = getImageExtension(file.filename, file.mimetype);
    const storedName = `${randomUUID()}${extension}`;
    const localPath = join(assetDir, storedName);
    await mkdir(assetDir, { recursive: true });
    await writeFile(localPath, await file.toBuffer());

    const publicBase = config.publicAssetBaseUrl ?? `http://127.0.0.1:${config.port}/assets`;
    return {
      fileName: file.filename,
      storedName,
      localPath,
      publicUrl: `${publicBase.replace(/\/$/, "")}/${storedName}`
    };
  });
}

function getImageExtension(filename: string, mimeType: string): string {
  const extension = extname(filename).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    return extension;
  }
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }
  return ".png";
}
