import { describe, expect, it } from "vitest";
import { buildAnimationPrompt } from "../src/actionTemplates";

describe("buildAnimationPrompt", () => {
  it("combines sprite constraints with the selected action and user prompt", () => {
    const prompt = buildAnimationPrompt({
      actionTemplate: "walk",
      actionPrompt: "walks forward with a steady loop",
      keyColor: "#00ff00"
    });

    expect(prompt).toContain("single 2D game character");
    expect(prompt).toContain("full body");
    expect(prompt).toContain("centered");
    expect(prompt).toContain("no camera movement");
    expect(prompt).toContain("solid #00ff00 background");
    expect(prompt).toContain("looping sprite animation style");
    expect(prompt).toContain("side-view, 2D game character walks forward");
    expect(prompt).toContain("walks forward with a steady loop");
  });
});
