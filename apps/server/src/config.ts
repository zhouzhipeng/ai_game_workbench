import { resolve } from "node:path";

export interface AppConfig {
  openRouterApiKey?: string;
  publicAssetBaseUrl?: string;
  ffmpegPath: string;
  storageDir: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    openRouterApiKey: env.OPENROUTER_API_KEY,
    publicAssetBaseUrl: env.PUBLIC_ASSET_BASE_URL,
    ffmpegPath: env.FFMPEG_PATH ?? "ffmpeg",
    storageDir: resolve(env.STORAGE_DIR ?? "./storage"),
    port: Number(env.PORT ?? 8787)
  };
}
