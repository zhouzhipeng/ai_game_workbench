export const ACTION_TEMPLATES = {
  idle: "side-view, 2D game character idle animation, body slightly sways",
  walk: "side-view, 2D game character walks forward",
  run: "side-view, 2D game character runs forward",
  jump: "side-view, 2D game character jumps in place, takeoff then fall",
  attack: "side-view, 2D game character performs a clear attack motion",
  hit: "side-view, 2D game character gets hit and recoils backward",
  defeated: "side-view, 2D game character kneels down and falls to the ground",
  custom: ""
} as const;

export type ActionTemplateKey = keyof typeof ACTION_TEMPLATES;

export interface BuildAnimationPromptInput {
  actionTemplate: ActionTemplateKey;
  actionPrompt: string;
  keyColor: string;
}

export function buildAnimationPrompt(input: BuildAnimationPromptInput): string {
  const baseConstraints = [
    "single 2D game character",
    "full body",
    "centered",
    "no camera movement",
    `solid ${input.keyColor} background`,
    "no shadow",
    "no ground",
    "no particles",
    "looping sprite animation style"
  ];
  const template = ACTION_TEMPLATES[input.actionTemplate];
  return [...baseConstraints, template, input.actionPrompt]
    .filter((part) => part.trim().length > 0)
    .join(", ");
}
