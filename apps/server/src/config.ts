import { resolve } from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import type { LocalCodexImageGenerator } from "./providers/localCodex";

export interface AppConfig {
  openRouterApiKey?: string;
  publicAssetBaseUrl?: string;
  ffmpegPath: string;
  storageDir: string;
  port: number;
  localCodexImageGenerator?: LocalCodexImageGenerator;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    openRouterApiKey: env.OPENROUTER_API_KEY,
    publicAssetBaseUrl: env.PUBLIC_ASSET_BASE_URL,
    ffmpegPath: env.FFMPEG_PATH ?? resolveDefaultFfmpegPath(),
    storageDir: resolve(env.STORAGE_DIR ?? "./storage"),
    port: Number(env.PORT ?? 8787)
  };
}

export function resolveDefaultFfmpegPath(): string {
  return ffmpegStaticPath ?? "ffmpeg";
}
