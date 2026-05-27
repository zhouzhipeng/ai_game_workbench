export interface TimelineFrame {
  id: string;
  url: string;
  index: number;
}

export function removeFrame<T extends TimelineFrame>(frames: readonly T[], frameId: string): T[] {
  return frames.filter((frame) => frame.id !== frameId);
}

export function moveFrame<T extends TimelineFrame>(
  frames: readonly T[],
  frameId: string,
  targetIndex: number
): T[] {
  const currentIndex = frames.findIndex((frame) => frame.id === frameId);
  if (currentIndex === -1) {
    return [...frames];
  }

  const nextFrames = [...frames];
  const [frame] = nextFrames.splice(currentIndex, 1);
  if (!frame) {
    return nextFrames;
  }

  const clampedIndex = Math.max(0, Math.min(targetIndex, nextFrames.length));
  nextFrames.splice(clampedIndex, 0, frame);
  return nextFrames;
}
