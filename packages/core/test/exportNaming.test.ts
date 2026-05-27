import { describe, expect, it } from "vitest";
import { buildExportNames, sanitizeKey } from "../src/exportNaming";

describe("sanitizeKey", () => {
  it("normalizes user-facing keys for filesystem-safe export names", () => {
    expect(sanitizeKey(" Hero Mecha / Walk Front!! ")).toBe("hero_mecha_walk_front");
  });
});

describe("buildExportNames", () => {
  it("builds sprite sheet, preview, and frame names from saved web keys", () => {
    const names = buildExportNames({
      assetKey: "hero mecha",
      animationKey: "walk/front",
      frameIndex: 1
    });

    expect(names.baseName).toBe("hero_mecha_walk_front");
    expect(names.sheetName).toBe("hero_mecha_walk_front_sheet.png");
    expect(names.previewGifName).toBe("hero_mecha_walk_front_preview.gif");
    expect(names.frameName).toBe("hero_mecha_walk_front_001.png");
  });
});
