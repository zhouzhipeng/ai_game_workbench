import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_KEYS } from "@ai-game-workbench/core";
import { createProjectStore, type ProjectStore } from "../src/storage/projectStore";

let tempDir: string;
let store: ProjectStore;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "ai-game-workbench-"));
  store = createProjectStore({ storageDir: tempDir });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("projectStore", () => {
  it("creates a default project state when project.json does not exist", async () => {
    const project = await store.getOrCreateProject("default");

    expect(project.projectId).toBe("default");
    expect(project.keys).toEqual(DEFAULT_KEYS);
    expect(project.updatedAt).toMatch(/T/);
  });

  it("persists saved web keys in project.json", async () => {
    await store.saveProjectKeys("default", {
      assetKey: "hero_alpha",
      animationKey: "walk_front",
      fps: 10,
      targetSize: 128,
      loop: false
    });

    const project = await store.getOrCreateProject("default");

    expect(project.keys).toEqual({
      assetKey: "hero_alpha",
      animationKey: "walk_front",
      fps: 10,
      targetSize: 128,
      loop: false
    });
  });
});
