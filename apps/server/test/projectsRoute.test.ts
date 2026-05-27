import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "ai-game-workbench-routes-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("project routes", () => {
  it("returns a default project", async () => {
    const app = createApp({ storageDir: tempDir });

    const response = await app.inject({
      method: "GET",
      url: "/api/projects/default"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      projectId: "default",
      keys: {
        assetKey: "hero_mecha",
        animationKey: "idle",
        fps: 12,
        targetSize: 256,
        loop: true
      }
    });
  });

  it("saves project keys", async () => {
    const app = createApp({ storageDir: tempDir });

    const response = await app.inject({
      method: "PUT",
      url: "/api/projects/default/keys",
      payload: {
        assetKey: "hero_alpha",
        animationKey: "walk_front",
        fps: 10,
        targetSize: 128,
        loop: false
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().keys).toEqual({
      assetKey: "hero_alpha",
      animationKey: "walk_front",
      fps: 10,
      targetSize: 128,
      loop: false
    });
  });
});
