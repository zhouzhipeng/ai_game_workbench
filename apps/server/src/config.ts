import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStaticPath from "ffmpeg-static";
import type { LocalCodexImageGenerator } from "./providers/localCodex";
import type { BirefnetMattingRunner } from "./processing/birefnet";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export interface AppConfig {
  openRouterApiKey?: string;
  openAiCompatibleBaseUrl?: string;
  openAiCompatibleApiKey?: string;
  adminSettingsToken?: string;
  publicAssetBaseUrl?: string;
  ffmpegPath: string;
  storageDir: string;
  module01CharacterExportDir: string;
  port: number;
  localCodexImageGenerator?: LocalCodexImageGenerator;
  birefnetPythonPath?: string;
  birefnetModelId?: string;
  birefnetDevice?: string;
  birefnetInputSize?: string;
  birefnetMattingRunner?: BirefnetMattingRunner;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    openRouterApiKey: env.OPENROUTER_API_KEY,
    openAiCompatibleBaseUrl: env.OPENAI_COMPATIBLE_BASE_URL,
    openAiCompatibleApiKey: env.OPENAI_COMPATIBLE_API_KEY,
    adminSettingsToken: env.ADMIN_SETTINGS_TOKEN,
    publicAssetBaseUrl: env.PUBLIC_ASSET_BASE_URL,
    ffmpegPath: env.FFMPEG_PATH ?? resolveDefaultFfmpegPath(),
    storageDir: resolve(env.STORAGE_DIR ?? "./storage"),
    module01CharacterExportDir: resolve(env.MODULE01_CHARACTER_EXPORT_DIR ?? resolveDefaultModule01CharacterExportDir()),
    port: Number(env.PORT ?? 8787),
    birefnetPythonPath: env.BIREFNET_PYTHON,
    birefnetModelId: env.BIREFNET_MODEL_ID,
    birefnetDevice: env.BIREFNET_DEVICE,
    birefnetInputSize: env.BIREFNET_INPUT_SIZE
  };
}

export function resolveDefaultFfmpegPath(): string {
  return ffmpegStaticPath ?? "ffmpeg";
}

export function resolveDefaultModule01CharacterExportDir(): string {
  return resolve(REPO_ROOT, "Export", "Character_2D");
}
