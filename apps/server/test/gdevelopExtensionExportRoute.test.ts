import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { createApp } from "../src/app";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("GDevelop extension export route", () => {
  it("uses character preview FPS settings for exported animation timings", async () => {
    const storageDir = makeTempDir("ai-game-workbench-gdevelop-export-storage-");
    const presetsDir = makeTempDir("ai-game-workbench-gdevelop-export-presets-");
    const module01CharacterExportDir = makeTempDir("ai-game-workbench-gdevelop-export-output-");
    await writeCharacterFrames(storageDir, "hero");
    writeModule01WorkflowConfig(presetsDir, {
      characterPreviewSettings: {
        idleFps: 4,
        walkFps: 9,
        runFps: 11,
        attackFps: 13,
        jumpFps: 15
      }
    });
    const app = createApp({
      ffmpegPath: "ffmpeg",
      port: 8787,
      storageDir,
      presetsDir,
      module01CharacterExportDir
    });
    await app.ready();

    try {
      const savedSettingsResponse = await app.inject({
        method: "POST",
        url: "/api/export/gdevelop-extension",
        payload: {
          characterId: "hero",
          exportSize: 512
        }
      });

      expect(savedSettingsResponse.statusCode).toBe(200);
      expectAnimationFps(savedSettingsResponse.json().extension, {
        idle_down: 4,
        walk_down: 9,
        run_down: 11,
        attack1_down: 13,
        jump_down: 15
      });

      const requestSettingsResponse = await app.inject({
        method: "POST",
        url: "/api/export/gdevelop-extension",
        payload: {
          characterId: "hero",
          exportSize: 512,
          characterPreviewSettings: {
            idleFps: 6,
            walkFps: 7,
            runFps: 8,
            attackFps: 10,
            jumpFps: 12
          }
        }
      });

      expect(requestSettingsResponse.statusCode).toBe(200);
      expectAnimationFps(requestSettingsResponse.json().extension, {
        idle_down: 6,
        walk_down: 7,
        run_down: 8,
        attack1_down: 10,
        jump_down: 12
      });

      const exportRoot = join(module01CharacterExportDir, "hero", "gdevelop-extension-512");
      expect(existsSync(join(exportRoot, "gdevelop-extension.json"))).toBe(true);
      const manifest = JSON.parse(readFileSync(join(exportRoot, "manifest.json"), "utf8"));
      expect(manifest.animations).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "idle_down", fps: 6 }),
        expect.objectContaining({ name: "walk_down", fps: 7 }),
        expect.objectContaining({ name: "run_down", fps: 8 }),
        expect.objectContaining({ name: "attack1_down", fps: 10 }),
        expect.objectContaining({ name: "jump_down", fps: 12 })
      ]));
    } finally {
      await app.close();
    }
  });
});

async function writeCharacterFrames(storageDir: string, characterId: string): Promise<void> {
  const directionKeys = ["down", "up", "left", "right"] as const;
  for (const direction of directionKeys) {
    const walkDir = join(storageDir, "characters", characterId, "base-character", "loop-export", "transparent", direction);
    mkdirSync(walkDir, { recursive: true });
    writeFileSync(join(walkDir, "frame_001.png"), await makeFrame("#22aa22"));
    writeFileSync(join(walkDir, "frame_002.png"), await makeFrame("#33bb33"));

    const runDir = join(storageDir, "characters", characterId, "advanced-character", "run", "export", "transparent", direction);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "frame_001.png"), await makeFrame("#aa2222"));

    const attackDir = join(storageDir, "characters", characterId, "advanced-character", "attack-1", "export", "transparent", direction);
    mkdirSync(attackDir, { recursive: true });
    writeFileSync(join(attackDir, "frame_001.png"), await makeFrame("#2222aa"));

    const jumpDir = join(storageDir, "characters", characterId, "advanced-character", "jump", "export", "transparent", direction);
    mkdirSync(jumpDir, { recursive: true });
    writeFileSync(join(jumpDir, "frame_001.png"), await makeFrame("#aa22aa"));
  }

  const idleDir = join(storageDir, "characters", characterId, "base-character", "loop-export", "idle", "transparent");
  mkdirSync(idleDir, { recursive: true });
  for (const direction of directionKeys) {
    writeFileSync(join(idleDir, `${direction}.png`), await makeFrame("#aaaa22"));
  }
}

async function makeFrame(color: string): Promise<Buffer> {
  return sharp({
    create: {
      width: 4,
      height: 4,
      channels: 4,
      background: color
    }
  }).png().toBuffer();
}

function writeModule01WorkflowConfig(presetsDir: string, config: Record<string, unknown>): void {
  const module01Dir = join(presetsDir, "module01");
  mkdirSync(module01Dir, { recursive: true });
  writeFileSync(join(module01Dir, "workflow.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function expectAnimationFps(extension: any, expectedFpsByAnimation: Record<string, number>): void {
  const sprite = extension.eventsBasedObjects[0].objects[0];
  for (const [animationName, fps] of Object.entries(expectedFpsByAnimation)) {
    const animation = sprite.animations.find((candidate: any) => candidate.name === animationName);
    expect(animation).toBeTruthy();
    expect(animation.directions[0].timeBetweenFrames).toBeCloseTo(1 / fps, 6);
  }
}
