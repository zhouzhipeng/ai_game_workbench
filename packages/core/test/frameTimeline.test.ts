import { describe, expect, it } from "vitest";
import { moveFrame, removeFrame, type TimelineFrame } from "../src/frameTimeline";

const frames: TimelineFrame[] = [
  { id: "f1", url: "/f1.png", index: 1 },
  { id: "f2", url: "/f2.png", index: 2 },
  { id: "f3", url: "/f3.png", index: 3 }
];

describe("removeFrame", () => {
  it("removes the selected frame without mutating the original array", () => {
    const result = removeFrame(frames, "f2");

    expect(result.map((frame) => frame.id)).toEqual(["f1", "f3"]);
    expect(frames.map((frame) => frame.id)).toEqual(["f1", "f2", "f3"]);
  });
});

describe("moveFrame", () => {
  it("moves a frame to a new index without mutating the original array", () => {
    const result = moveFrame(frames, "f3", 0);

    expect(result.map((frame) => frame.id)).toEqual(["f3", "f1", "f2"]);
    expect(frames.map((frame) => frame.id)).toEqual(["f1", "f2", "f3"]);
  });
});
