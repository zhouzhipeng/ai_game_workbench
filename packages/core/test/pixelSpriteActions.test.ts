import { describe, expect, it } from "vitest";
import { findPixelSpriteAction, PIXEL_SPRITE_ACTIONS } from "../src/pixelSpriteActions";

describe("pixel sprite actions", () => {
  it("exposes only the implemented module 02 idle and walk actions", () => {
    expect(PIXEL_SPRITE_ACTIONS.map((action) => action.id)).toEqual(["idle", "walk"]);
    expect(findPixelSpriteAction("idle")?.name).toBe("角色基准模板");
    expect(findPixelSpriteAction("walk")?.referenceImage).toBe("walk-4x10-no-shadow.png");
    expect(findPixelSpriteAction("run")).toBeUndefined();
  });
});
