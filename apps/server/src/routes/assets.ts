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
  const jobsDir = join(config.storageDir, "jobs");
  mkdirSync(assetDir, { recursive: true });
  mkdirSync(jobsDir, { recursive: true });

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
  void app.register(fastifyStatic, {
    root: jobsDir,
    prefix: "/jobs/",
    decorateReply: false
  });

  app.post("/api/assets/first-frame", async (request, reply) => {
    const publicBaseResult = resolvePublicAssetBaseUrl(request.headers["x-public-asset-base-url"], config);
    if ("error" in publicBaseResult) {
      return reply.code(400).send({ error: publicBaseResult.error });
    }
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

    return {
      fileName: file.filename,
      storedName,
      localPath,
      publicUrl: `${publicBaseResult.publicBase.replace(/\/$/, "")}/${storedName}`
    };
  });
}

export function resolvePublicAssetBaseUrl(
  headerValue: string | string[] | undefined,
  config: AssetRouteConfig
): { publicBase: string; error?: undefined } | { publicBase?: undefined; error: string } {
  const requestValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const requestBase = requestValue?.trim();
  if (requestBase) {
    const normalized = normalizePublicAssetBaseUrl(requestBase);
    if (!normalized) {
      return { error: "公网资源地址必须是有效 HTTPS URL。" };
    }
    if (!normalized.startsWith("https://")) {
      return { error: "公网资源地址必须使用 HTTPS，才能被 OpenRouter 视频模型访问。" };
    }
    return { publicBase: normalized };
  }

  if (config.publicAssetBaseUrl) {
    return { publicBase: normalizePublicAssetBaseUrl(config.publicAssetBaseUrl) ?? config.publicAssetBaseUrl.replace(/\/$/, "") };
  }
  return { publicBase: `http://127.0.0.1:${config.port}/assets` };
}

function normalizePublicAssetBaseUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.pathname === "" || url.pathname === "/") {
      url.pathname = "/assets";
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
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
