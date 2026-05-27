import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "ai-game-workbench-assets-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("asset routes", () => {
  it("uploads a first-frame image and returns a public asset URL", async () => {
    const app = createApp({
      storageDir: tempDir,
      port: 8787,
      publicAssetBaseUrl: "http://127.0.0.1:8787/assets"
    });
    const boundary = "----ai-game-workbench-test";
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="hero.png"',
      "Content-Type: image/png",
      "",
      "fake-png-bytes",
      `--${boundary}--`,
      ""
    ].join("\r\n");

    const response = await app.inject({
      method: "POST",
      url: "/api/assets/first-frame",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`
      },
      payload
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.fileName).toBe("hero.png");
    expect(body.publicUrl).toMatch(/^http:\/\/127\.0\.0\.1:8787\/assets\/.+\.png$/);
    expect(await readFile(body.localPath, "utf8")).toBe("fake-png-bytes");
  });

  it("uses a tunnel base URL from the upload request", async () => {
    const app = createApp({
      storageDir: tempDir,
      port: 8787
    });
    const boundary = "----ai-game-workbench-test";
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="hero.png"',
      "Content-Type: image/png",
      "",
      "fake-png-bytes",
      `--${boundary}--`,
      ""
    ].join("\r\n");

    const response = await app.inject({
      method: "POST",
      url: "/api/assets/first-frame",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "x-public-asset-base-url": "https://asset-tunnel.trycloudflare.com"
      },
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().publicUrl).toMatch(/^https:\/\/asset-tunnel\.trycloudflare\.com\/assets\/.+\.png$/);
  });

  it("rejects non-HTTPS tunnel base URLs from the upload request", async () => {
    const app = createApp({
      storageDir: tempDir,
      port: 8787
    });
    const boundary = "----ai-game-workbench-test";
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="hero.png"',
      "Content-Type: image/png",
      "",
      "fake-png-bytes",
      `--${boundary}--`,
      ""
    ].join("\r\n");

    const response = await app.inject({
      method: "POST",
      url: "/api/assets/first-frame",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "x-public-asset-base-url": "http://asset-tunnel.local"
      },
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("HTTPS");
  });
});
