import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateLocalCodexVideo, resolveCodexCommand } from "../src/providers/localCodex";

const originalLocalAppData = process.env.LOCALAPPDATA;
const originalLocalCodexBin = process.env.LOCAL_CODEX_BIN;
const originalLocalGptSoraBin = process.env.LOCAL_GPT_SORA_BIN;
const originalLocalGptSoraArgs = process.env.LOCAL_GPT_SORA_ARGS;
const originalLocalGptSoraUseCodex = process.env.LOCAL_GPT_SORA_USE_CODEX;
const originalLocalSoraBin = process.env.LOCAL_SORA_BIN;
const originalLocalSoraArgs = process.env.LOCAL_SORA_ARGS;
const tempDirs: string[] = [];

afterEach(() => {
  process.env.LOCALAPPDATA = originalLocalAppData;
  if (originalLocalCodexBin === undefined) {
    delete process.env.LOCAL_CODEX_BIN;
  } else {
    process.env.LOCAL_CODEX_BIN = originalLocalCodexBin;
  }
  restoreEnv("LOCAL_GPT_SORA_BIN", originalLocalGptSoraBin);
  restoreEnv("LOCAL_GPT_SORA_ARGS", originalLocalGptSoraArgs);
  restoreEnv("LOCAL_GPT_SORA_USE_CODEX", originalLocalGptSoraUseCodex);
  restoreEnv("LOCAL_SORA_BIN", originalLocalSoraBin);
  restoreEnv("LOCAL_SORA_ARGS", originalLocalSoraArgs);
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("local Codex image provider", () => {
  it("resolves the Codex Desktop executable before falling back to PATH", () => {
    const localAppData = mkdtempSync(join(tmpdir(), "ai-game-workbench-codex-bin-"));
    tempDirs.push(localAppData);
    delete process.env.LOCAL_CODEX_BIN;
    process.env.LOCALAPPDATA = localAppData;
    const codexBinDir = join(localAppData, "OpenAI", "Codex", "bin", "desktop-build");
    mkdirSync(codexBinDir, { recursive: true });
    const codexExe = join(codexBinDir, "codex.exe");
    writeFileSync(codexExe, "");

    expect(resolveCodexCommand()).toEqual({
      command: codexExe,
      argsPrefix: [],
      label: codexExe
    });
  });
});

describe("local GPT Sora video provider", () => {
  it("fails fast when no local Sora executable is configured", async () => {
    delete process.env.LOCAL_GPT_SORA_BIN;
    delete process.env.LOCAL_GPT_SORA_ARGS;
    delete process.env.LOCAL_GPT_SORA_USE_CODEX;
    delete process.env.LOCAL_SORA_BIN;
    delete process.env.LOCAL_SORA_ARGS;

    await expect(generateLocalCodexVideo({
      model: "local/gpt-sora",
      prompt: "make a walk cycle",
      durationSeconds: 4,
      resolution: "720p",
      imagePaths: [],
      workingDirectory: process.cwd()
    })).rejects.toThrow(/LOCAL_GPT_SORA_BIN/);
  });

  it("runs a configured local Sora command and reads the generated MP4", async () => {
    const root = mkdtempSync(join(tmpdir(), "ai-game-workbench-local-sora-test-"));
    tempDirs.push(root);
    const scriptPath = join(root, "fake-sora.js");
    const inputImagePath = join(root, "input.png");
    writeFileSync(inputImagePath, "image");
    writeFileSync(scriptPath, `
const fs = require("node:fs");
const args = process.argv.slice(2);
const output = args[args.indexOf("--output") + 1];
const promptFile = args[args.indexOf("--prompt-file") + 1];
const duration = args[args.indexOf("--duration") + 1];
const resolution = args[args.indexOf("--resolution") + 1];
if (!output || !promptFile || duration !== "6" || resolution !== "1080p" || !args.includes("${inputImagePath.replace(/\\/g, "\\\\")}")) {
  process.exit(2);
}
if (!fs.readFileSync(promptFile, "utf8").includes("make a walk cycle")) {
  process.exit(3);
}
fs.writeFileSync(output, Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]));
`);
    process.env.LOCAL_GPT_SORA_BIN = process.execPath;
    process.env.LOCAL_GPT_SORA_ARGS = JSON.stringify([
      scriptPath,
      "--prompt-file",
      "{promptFile}",
      "--output",
      "{output}",
      "--duration",
      "{duration}",
      "--resolution",
      "{resolution}",
      "{imageArgs}"
    ]);
    delete process.env.LOCAL_GPT_SORA_USE_CODEX;
    delete process.env.LOCAL_SORA_BIN;
    delete process.env.LOCAL_SORA_ARGS;

    const result = await generateLocalCodexVideo({
      model: "local/gpt-sora",
      prompt: "make a walk cycle",
      durationSeconds: 6,
      resolution: "1080p",
      imagePaths: [inputImagePath],
      workingDirectory: root
    });

    expect([...result.buffer]).toEqual([0, 0, 0, 24, 102, 116, 121, 112]);
    expect(result.extension).toBe("mp4");
    expect(result.providerResponse.provider).toBe("local-sora-command");
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
