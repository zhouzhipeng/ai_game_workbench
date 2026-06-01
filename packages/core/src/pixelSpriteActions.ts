export type PixelSpriteActionId = "idle" | "walk";

export interface PixelSpriteActionTemplate {
  id: PixelSpriteActionId;
  name: string;
  referenceImage: string;
  constraintPrompt: string;
  defaultFrameCount: number;
  directionCount: number;
}

const IDLE_CONSTRAINT_PROMPT = [
  "你是资深像素艺术家和动画师，专门为电子游戏设计可直接投产的 2D 角色精灵图。",
  "生成像素风格的角色基准模板，严格保持角色外观、发型、服装、配色、体型比例和像素颗粒感。",
  "输出必须是 2 行 2 列：左上向下正面待机，右上向左待机，左下向右待机，右下向上背面待机。",
  "每个方向只生成 1 个稳定待机姿势，不生成多帧循环。",
  "背景使用纯色绿幕 #00ff00，不要阴影、地面、文字、编号、辅助线、UI 或可见网格线。"
].join("\n");

const WALK_CONSTRAINT_PROMPT = [
  "你是资深像素艺术家和动画师，专门为电子游戏设计可直接投产的 2D 角色精灵图。",
  "基于角色基准模板生成四方向步行 sprite sheet，严格保持角色外观、服装、配色和像素颗粒感，只改变步行动作。",
  "输出必须是 4 行 10 列：第 1 行向下走动，第 2 行向左走动，第 3 行向右走动，第 4 行向上走动。",
  "每行 10 帧应形成平滑原地步行循环，角色必须始终居中且不出格。",
  "背景使用纯色绿幕 #00ff00，不要阴影、地面、文字、编号、辅助线、UI 或可见网格线。"
].join("\n");

export const PIXEL_SPRITE_ACTIONS: readonly PixelSpriteActionTemplate[] = [
  {
    id: "idle",
    name: "角色基准模板",
    referenceImage: "idle-2x2-centered.png",
    constraintPrompt: IDLE_CONSTRAINT_PROMPT,
    defaultFrameCount: 2,
    directionCount: 2
  },
  {
    id: "walk",
    name: "四方向步行图",
    referenceImage: "walk-4x10-no-shadow.png",
    constraintPrompt: WALK_CONSTRAINT_PROMPT,
    defaultFrameCount: 10,
    directionCount: 4
  }
] as const;

export function findPixelSpriteAction(actionId: string): PixelSpriteActionTemplate | undefined {
  return PIXEL_SPRITE_ACTIONS.find((action) => action.id === actionId);
}
