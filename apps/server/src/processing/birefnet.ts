import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FrameMattingRunner } from "./imageProcessing";

export type BirefnetMattingRunner = FrameMattingRunner;
export type BirefnetBatchMattingRunner = (inputs: readonly Buffer[]) => Promise<Buffer[]>;

export interface BirefnetMattingConfig {
  storageDir: string;
  pythonPath?: string;
  modelId?: string;
  device?: string;
  inputSize?: string;
}

const DEFAULT_MODEL_ID = "ZhengPeng7/BiRefNet";
const SETUP_TIMEOUT_MS = 20 * 60 * 1000;
const INFERENCE_TIMEOUT_MS = 5 * 60 * 1000;
let setupPromise: Promise<string> | null = null;

export function createLocalBirefnetMattingRunner(config: BirefnetMattingConfig): BirefnetMattingRunner {
  return async (input: Buffer) => {
    const [output] = await runLocalBirefnetBatchMatting([input], config);
    if (!output) {
      throw new Error("BiRefNet 没有返回抠图结果。");
    }
    return output;
  };
}

export function createLocalBirefnetBatchMattingRunner(config: BirefnetMattingConfig): BirefnetBatchMattingRunner {
  return async (inputs: readonly Buffer[]) => runLocalBirefnetBatchMatting(inputs, config);
}

export async function runLocalBirefnetMatting(
  input: Buffer,
  config: BirefnetMattingConfig
): Promise<Buffer> {
  const [output] = await runLocalBirefnetBatchMatting([input], config);
  if (!output) {
    throw new Error("BiRefNet 没有返回抠图结果。");
  }
  return output;
}

export async function runLocalBirefnetBatchMatting(
  inputs: readonly Buffer[],
  config: BirefnetMattingConfig
): Promise<Buffer[]> {
  const pythonPath = await ensureBirefnetRuntime(config);
  const runDir = await mkdtemp(join(tmpdir(), "ai-game-workbench-birefnet-"));
  try {
    const inputDir = join(runDir, "input");
    const outputDir = join(runDir, "output");
    await mkdir(inputDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    await Promise.all(inputs.map((input, index) => writeFile(join(inputDir, `${String(index).padStart(5, "0")}.png`), input)));
    await runCommand(pythonPath, [resolveBirefnetScriptPath(), inputDir, outputDir], {
      cwd: dirname(resolveBirefnetScriptPath()),
      timeoutMs: Math.max(INFERENCE_TIMEOUT_MS, inputs.length * INFERENCE_TIMEOUT_MS),
      env: buildBirefnetEnv(config)
    });
    return await Promise.all(inputs.map((_, index) => readFile(join(outputDir, `${String(index).padStart(5, "0")}.png`))));
  } catch (error: unknown) {
    throw new Error(`BiRefNet 抠图失败：${readErrorMessage(error)}`);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}

async function ensureBirefnetRuntime(config: BirefnetMattingConfig): Promise<string> {
  if (config.pythonPath?.trim()) {
    return config.pythonPath.trim();
  }
  setupPromise ??= setupBirefnetRuntime(config).finally(() => {
    setupPromise = null;
  });
  return setupPromise;
}

async function setupBirefnetRuntime(config: BirefnetMattingConfig): Promise<string> {
  const runtimeDir = join(config.storageDir, "runtime", "birefnet-venv");
  const pythonPath = resolveVenvPythonPath(runtimeDir);
  if (!existsSync(pythonPath)) {
    await mkdir(dirname(runtimeDir), { recursive: true });
    await runCommand(resolveSystemPythonCommand(), ["-m", "venv", runtimeDir], {
      timeoutMs: SETUP_TIMEOUT_MS,
      env: process.env
    });
  }
  await runCommand(pythonPath, ["-m", "pip", "install", "--upgrade", "pip"], {
    timeoutMs: SETUP_TIMEOUT_MS,
    env: buildPipEnv()
  });
  await runCommand(pythonPath, [
    "-m",
    "pip",
    "install",
    "torch",
    "torchvision",
    "pillow",
    "transformers",
    "safetensors",
    "timm",
    "kornia",
    "einops",
    "numpy"
  ], {
    timeoutMs: SETUP_TIMEOUT_MS,
    env: buildPipEnv()
  });
  await mkdir(join(config.storageDir, "models", "birefnet"), { recursive: true });
  return pythonPath;
}

function resolveSystemPythonCommand(): string {
  return process.platform === "win32" ? "python" : "python3";
}

function resolveVenvPythonPath(runtimeDir: string): string {
  return process.platform === "win32"
    ? join(runtimeDir, "Scripts", "python.exe")
    : join(runtimeDir, "bin", "python");
}

function buildPipEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PIP_DISABLE_PIP_VERSION_CHECK: "1"
  };
}

function buildBirefnetEnv(config: BirefnetMattingConfig): NodeJS.ProcessEnv {
  const modelRoot = join(config.storageDir, "models", "birefnet");
  return {
    ...process.env,
    HF_HOME: process.env.HF_HOME ?? modelRoot,
    TRANSFORMERS_CACHE: process.env.TRANSFORMERS_CACHE ?? join(modelRoot, "transformers"),
    BIREFNET_MODEL_ID: config.modelId || process.env.BIREFNET_MODEL_ID || DEFAULT_MODEL_ID,
    BIREFNET_DEVICE: config.device || process.env.BIREFNET_DEVICE || "auto",
    BIREFNET_INPUT_SIZE: config.inputSize || process.env.BIREFNET_INPUT_SIZE || "512"
  };
}

function resolveBirefnetScriptPath(): string {
  const direct = fileURLToPath(new URL("./birefnet_matting.py", import.meta.url));
  if (existsSync(direct)) {
    return direct;
  }
  return resolve(process.cwd(), "apps", "server", "src", "processing", "birefnet_matting.py");
}

function runCommand(
  command: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs: number;
  }
): Promise<void> {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`命令超时：${command} ${args.join(" ")}`));
    }, options.timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`无法启动命令 ${command}：${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolveCommand();
        return;
      }
      reject(new Error([stderr.trim(), stdout.trim()].filter(Boolean).join("\n") || `命令退出码 ${code}`));
    });
  });
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
