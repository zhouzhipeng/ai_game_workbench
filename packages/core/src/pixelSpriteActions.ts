export type PixelSpriteActionId = "idle" | "walk";

export interface PixelSpriteActionTemplate {
  id: PixelSpriteActionId;
  name: string;
  referenceImage: string;
  constraintPrompt: string;
  defaultFrameCount: number;
  directionCount: number;
}

const IDLE_CONSTRAINT_PROMPT = `你是一名资深像素艺术家和动画师，专门为电子游戏设计可直接投入生产的 2D 角色精灵图。你的核心专长在于保证结构布局的一致性、角色造型的一致性，并严格遵循轴测（等距）或正交网格的限制。

## 1. 核心限制与格式要求

* 网格布局：你必须严格按照第一张参考图的四方向待机姿势，将所有角色排布在 2 行 2 列的功能性布局中。
* 画布与宽高比：最终输出必须是 2×2 角色基准模板，四个角色各自位于方格中心，不要互相重叠。
* 画面纯净度：图像中不得出现任何 UI 元素、文本标签、可见的网格线、辅助线或数字。
* 背景：默认使用纯色、无缝的背景——标准的色键绿（绿幕），以便游戏开发者进行素材抠图。
* 动作约束：每个方向只生成 1 个稳定待机姿势，不生成多帧循环，不生成走路、跑步、攻击、跳跃、转身或夸张动作。

## 2. 输出排列

在生成角色待机图时，必须精准地按以下顺序安排四个方格：

* 左上：向下/正面待机
* 右上：向左待机
* 左下：向右待机
* 右下：向上/背面待机

## 3. 参考图

第一张图作为待机姿势参考，只参考姿势、方向顺序和角色在方格中的居中方式。
第二张图作为角色参考图，必须严格保持第二张图中的角色外观、发型、服装、配色、体型比例和像素颗粒感。
生成像素风格的角色基准模板。

2 行 2 列。
无阴影。不要生成脚底影子、椭圆影子、接触阴影、投影、地面、文字、编号、辅助线或可见网格线。`;

const WALK_CONSTRAINT_PROMPT = `你是一名资深像素艺术家和动画师，专门为电子游戏设计可直接投入生产的 2D 角色精灵图。你的核心专长在于保证结构布局的一致性、动作的流畅度，并严格遵循轴测（等距）或正交网格的限制。

## 1. 核心限制与格式要求

* 网格布局：你必须严格按照第一张参考图的动画序列，将所有角色图集排布在功能性的参考图网格布局中。
* 画布与宽高比：最终输出的画布比例必须严格和第一张参考图一样。
* 画面纯净度：图像中不得出现任何 UI 元素、文本标签、可见的网格线、辅助线或数字。
* 背景：默认使用纯色、无缝的背景——标准的色键绿（绿幕），以便游戏开发者进行素材抠图。
* 角色一致性：必须严格保持第二张图中的角色外观、发型、服装、配色、体型比例和像素颗粒感，只改变步行动作。

## 2. 动画序列工作流

在生成角色精灵图时，必须精准地按以下顺序安排各行内容：

* 第一行：向下走动（10 帧）
* 第二行：向左走动（10 帧）
* 第三行：向右走动（10 帧）
* 第四行：向上走动（10 帧）

## 3. 参考图

第一张图作为步行动作和四方向排布模板，只参考动作节奏、帧数、行列顺序、角色站位和网格比例。
第二张图作为角色基准模板，必须严格保持第二张图中的角色外观、发型、服装、配色、体型比例和像素颗粒感。
生成像素风格的四方向步行图。

四行10列。
无阴影。不要生成脚底影子、椭圆影子、接触阴影、投影、地面、文字、编号、辅助线或可见网格线。`;

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
