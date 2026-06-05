import { Film, ImagePlus, Settings } from "lucide-react";

interface WorkbenchHubProps {
  onOpenApiSettings: () => void;
  onOpenPixelSpriteGenerator: () => void;
  onOpenSpriteAnimator: () => void;
}

export function WorkbenchHub({ onOpenApiSettings, onOpenPixelSpriteGenerator, onOpenSpriteAnimator }: WorkbenchHubProps) {
  return (
    <main className="app-shell hub-shell">
      <section className="hub-hero">
        <div>
          <p className="eyebrow">开源游戏创作工具箱</p>
          <h1>AI 游戏工作台</h1>
          <p className="hub-copy">
            用紧凑的 AI 工作流、本地后处理和面向引擎的导出方式，制作可直接进入游戏管线的素材。
          </p>
        </div>
      </section>

      <section className="module-grid" aria-label="工作台模块">
        <button className="module-card module-card-active" type="button" onClick={onOpenSpriteAnimator}>
          <span className="module-icon"><Film size={28} /></span>
          <span className="module-title">模块 01：高清2D角色制作</span>
          <span className="module-desc">生成角色基准模板、基础角色方向图、步行动画和循环精灵帧。</span>
        </button>

        <button className="module-card module-card-active" type="button" onClick={onOpenPixelSpriteGenerator}>
          <span className="module-icon"><ImagePlus size={28} /></span>
          <span className="module-title">模块 02：像素角色制作</span>
          <span className="module-desc">生成像素角色基准模板/待机、四方向步行图，并切分 idle / walk 精灵帧。</span>
        </button>

        <button className="module-card module-card-active" type="button" onClick={onOpenApiSettings}>
          <span className="module-icon"><Settings size={28} /></span>
          <span className="module-title">API Settings</span>
          <span className="module-desc">Manage global providers, API keys, model allowlists, and default generation models.</span>
        </button>
      </section>
    </main>
  );
}
