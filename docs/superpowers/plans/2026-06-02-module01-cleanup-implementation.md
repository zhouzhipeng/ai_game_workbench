# Module 01 Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize Module 01 into a consistent action-grouped workflow with a dedicated settings center, while preserving the existing generation APIs and asset behavior.

**Architecture:** Keep `SpriteAnimator` as the state owner for the first pass, but extract small presentational components and navigation/settings metadata under `apps/web/src/components/module01/`. Main workflow pages produce assets; `Module01Settings` owns reusable defaults, reference images, and system prompts. Tests drive visible layout and wording changes before implementation.

**Tech Stack:** TypeScript, React, Vite, Vitest, Testing Library, existing Fastify APIs, existing CSS in `apps/web/src/styles.css`.

---

## File Structure

- Create `apps/web/src/components/module01/module01Model.ts`: page ids, navigation labels, settings group ids, and helper metadata.
- Create `apps/web/src/components/module01/Module01Stage.tsx`: reusable page section primitives for headers, media grids, controls, advanced details, and status rows.
- Create `apps/web/src/components/module01/Module01ActionPage.tsx`: action-page shell for walk, idle, run, attack 1, and jump.
- Create `apps/web/src/components/module01/Module01Settings.tsx`: settings center grouped by action/page.
- Modify `apps/web/src/components/SpriteAnimator.tsx`: replace old page ids, wire new components, hide system/final prompts from main workflow pages, and route old handlers into aligned sections.
- Modify `apps/web/src/styles.css`: add layout classes for action pages, settings center, status rows, and advanced details.
- Modify `apps/web/test/App.test.tsx`: update Module 01 tests to assert the new navigation, page structure, settings grouping, and wording.
- Do not modify `apps/web/src/api/client.ts` or server routes in this cleanup. Reuse existing generation, upload, processing, and workflow-config APIs.

---

## Task 1: Lock New Navigation And Page Model

**Files:**
- Create: `apps/web/src/components/module01/module01Model.ts`
- Modify: `apps/web/src/components/SpriteAnimator.tsx`
- Test: `apps/web/test/App.test.tsx`

- [ ] **Step 1: Replace the existing Module 01 navigation test with a failing test for action-grouped navigation**

In `apps/web/test/App.test.tsx`, replace the body of `it("opens module 01 with two-level navigation and the base template page", ...)` with:

```tsx
openSpriteAnimator();

expect(screen.getByRole("button", { name: "一键生成" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "基准模板" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "步行" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "待机" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "跑步" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "攻击 1" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "跳跃" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "角色预览" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "导出" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "模块设置" })).toBeInTheDocument();

expect(screen.queryByRole("button", { name: "参考图设置" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "步行四方向" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "待机四方向" })).not.toBeInTheDocument();
expect(screen.queryByText("基础角色生成")).not.toBeInTheDocument();
expect(screen.queryByText("进阶角色生成")).not.toBeInTheDocument();

expect(screen.getByRole("heading", { name: "基准模板" })).toBeInTheDocument();
expect(screen.getByLabelText(/图像模型/i)).toHaveValue(APIMART_IMAGE_MODEL);
expect(screen.queryByLabelText(/视频模型/i)).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: /一键处理/i })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the focused web test and verify it fails**

Run:

```powershell
npm run test -w apps/web -- App.test.tsx
```

Expected: this test fails because the old navigation still contains `参考图设置`, `步行四方向`, `待机四方向`, and grouped headings.

- [ ] **Step 3: Create the Module 01 page model**

Create `apps/web/src/components/module01/module01Model.ts` with:

```ts
export type Module01Page =
  | "one-click-character"
  | "base-template"
  | "walk"
  | "idle"
  | "run"
  | "attack-1"
  | "jump"
  | "character-preview"
  | "godot-export"
  | "module-settings";

export type Module01SettingsGroup =
  | "base-template"
  | "walk"
  | "idle"
  | "run"
  | "attack-1"
  | "jump"
  | "character-preview"
  | "godot-export";

export interface Module01NavItem {
  id: Module01Page;
  label: string;
  shortLabel: string;
}

export const MODULE01_NAV_ITEMS: readonly Module01NavItem[] = [
  { id: "one-click-character", label: "一键生成", shortLabel: "一键" },
  { id: "base-template", label: "基准模板", shortLabel: "基准" },
  { id: "walk", label: "步行", shortLabel: "步行" },
  { id: "idle", label: "待机", shortLabel: "待机" },
  { id: "run", label: "跑步", shortLabel: "跑步" },
  { id: "attack-1", label: "攻击 1", shortLabel: "攻击" },
  { id: "jump", label: "跳跃", shortLabel: "跳跃" },
  { id: "character-preview", label: "角色预览", shortLabel: "预览" },
  { id: "godot-export", label: "导出", shortLabel: "导出" },
  { id: "module-settings", label: "模块设置", shortLabel: "设置" }
];

export const MODULE01_PAGE_LABELS: Record<Module01Page, string> = Object.fromEntries(
  MODULE01_NAV_ITEMS.map((item) => [item.id, item.label])
) as Record<Module01Page, string>;

export interface Module01SettingsGroupItem {
  id: Module01SettingsGroup;
  label: string;
  saveLabel: string;
}

export const MODULE01_SETTINGS_GROUPS: readonly Module01SettingsGroupItem[] = [
  { id: "base-template", label: "基准模板设置", saveLabel: "保存基准模板设置" },
  { id: "walk", label: "步行设置", saveLabel: "保存步行设置" },
  { id: "idle", label: "待机设置", saveLabel: "保存待机设置" },
  { id: "run", label: "跑步设置", saveLabel: "保存跑步设置" },
  { id: "attack-1", label: "攻击 1 设置", saveLabel: "保存攻击 1 设置" },
  { id: "jump", label: "跳跃设置", saveLabel: "保存跳跃设置" },
  { id: "character-preview", label: "角色预览设置", saveLabel: "保存角色预览设置" },
  { id: "godot-export", label: "导出设置", saveLabel: "保存导出设置" }
];
```

- [ ] **Step 4: Wire the new page ids into `SpriteAnimator.tsx`**

In `apps/web/src/components/SpriteAnimator.tsx`:

1. Import:

```ts
import {
  MODULE01_NAV_ITEMS,
  MODULE01_PAGE_LABELS,
  type Module01Page
} from "./module01/module01Model";
```

2. Remove the local `type Module01Page = ...` and `MODULE_PAGES`.
3. Change the initial active page state to:

```ts
const [activePage, setActivePage] = useState<Module01Page>("base-template");
```

4. Replace the hard-coded navigation buttons with:

```tsx
<div className="nav-group-title">流程</div>
{MODULE01_NAV_ITEMS.slice(0, 9).map((item) => (
  <button
    key={item.id}
    className={["nav-item", activePage === item.id ? "nav-item-active" : ""].filter(Boolean).join(" ")}
    type="button"
    onClick={() => setActivePage(item.id)}
  >
    {item.id === "one-click-character" ? <WandSparkles size={18} /> : null}
    {item.id === "character-preview" ? <Gamepad2 size={18} /> : null}
    {item.id === "godot-export" ? <Download size={18} /> : null}
    {item.label}
  </button>
))}
<div className="nav-group-title">配置</div>
<button
  className={["nav-item", activePage === "module-settings" ? "nav-item-active" : ""].filter(Boolean).join(" ")}
  type="button"
  onClick={() => setActivePage("module-settings")}
>
  <Settings size={18} /> 模块设置
</button>
```

5. Change the header breadcrumb to:

```tsx
<p className="eyebrow">模块 01 / {MODULE01_PAGE_LABELS[activePage]}</p>
```

6. Rename page conditionals:

```tsx
{activePage === "walk" ? (/* old direction-templates content */) : null}
{activePage === "idle" ? (/* old walk-videos content */) : null}
{activePage === "run" ? (/* old advanced-run content */) : null}
{activePage === "attack-1" ? (/* old advanced-attack-1 content */) : null}
{activePage === "jump" ? (/* old advanced-jump content */) : null}
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```powershell
npm run test -w apps/web -- App.test.tsx
```

Expected: the navigation test passes; other web tests may still fail because labels and page names changed.

- [ ] **Step 6: Commit navigation model**

Run:

```powershell
git add apps/web/src/components/module01/module01Model.ts apps/web/src/components/SpriteAnimator.tsx apps/web/test/App.test.tsx
git commit -m "Refactor module 01 navigation model"
```

---

## Task 2: Add Shared Stage Primitives

**Files:**
- Create: `apps/web/src/components/module01/Module01Stage.tsx`
- Modify: `apps/web/src/components/SpriteAnimator.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/App.test.tsx`

- [ ] **Step 1: Add a failing test for consistent action section labels**

Add this test near the existing Module 01 tests in `apps/web/test/App.test.tsx`:

```tsx
it("uses aligned section labels for action pages", () => {
  openSpriteAnimator();

  fireEvent.click(screen.getByRole("button", { name: "步行" }));
  expect(screen.getByRole("heading", { name: "步行" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "步行图片" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "步行视频与一键处理" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "步行结果" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "跑步" }));
  expect(screen.getByRole("heading", { name: "跑步" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "跑步图片" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "跑步视频与一键处理" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "跑步结果" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "攻击 1" }));
  expect(screen.getByRole("heading", { name: "攻击 1" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "攻击 1 图片" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "攻击 1 视频与一键处理" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "攻击 1 结果" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "跳跃" }));
  expect(screen.getByRole("heading", { name: "跳跃" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "跳跃图片" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "跳跃视频与一键处理" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "跳跃结果" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm run test -w apps/web -- App.test.tsx
```

Expected: the new test fails because the old `WorkflowStage` does not expose action-specific regions.

- [ ] **Step 3: Create shared Module 01 stage primitives**

Create `apps/web/src/components/module01/Module01Stage.tsx`:

```tsx
import type { ReactNode } from "react";

export interface Module01StatusItem {
  label: string;
  value: string;
  state?: "ready" | "missing" | "running" | "done";
}

export function Module01PageStage({
  title,
  status,
  statusItems,
  children
}: {
  title: string;
  status: string;
  statusItems?: readonly Module01StatusItem[];
  children: ReactNode;
}) {
  return (
    <section className="workflow-stage module01-page-stage">
      <div className="stage-heading">
        <h2>{title}</h2>
        <span>{status}</span>
      </div>
      {statusItems?.length ? (
        <div className="module01-status-grid">
          {statusItems.map((item) => (
            <div className={`module01-status-item module01-status-${item.state ?? "ready"}`} key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      <div className="module01-page-body">{children}</div>
    </section>
  );
}

export function Module01ActionSection({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="module01-action-section" aria-label={title}>
      <div className="module01-section-heading">
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function Module01MediaGrid({
  children,
  columns = 2
}: {
  children: ReactNode;
  columns?: 2 | 3;
}) {
  return (
    <div className={["stage-media-grid", columns === 3 ? "stage-media-grid-three" : ""].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

export function Module01AdvancedDetails({
  title = "高级设置",
  children
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <details className="module01-advanced-details">
      <summary>{title}</summary>
      <div className="module01-advanced-body">{children}</div>
    </details>
  );
}
```

- [ ] **Step 4: Add CSS for the new primitives**

Append to `apps/web/src/styles.css` before the first media query:

```css
.module01-page-stage {
  display: grid;
  gap: 14px;
}

.module01-page-body {
  display: grid;
  gap: 14px;
}

.module01-status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
}

.module01-status-item {
  border: 1px solid #384255;
  border-radius: 8px;
  background: #10151d;
  padding: 9px 10px;
  display: grid;
  gap: 4px;
}

.module01-status-item span {
  color: #9dacbd;
  font-size: 12px;
}

.module01-status-item strong {
  color: #f4f0de;
  font-size: 13px;
}

.module01-status-missing strong {
  color: #ffb5a8;
}

.module01-status-running strong {
  color: #68e1fd;
}

.module01-status-done strong {
  color: #9be59b;
}

.module01-action-section {
  border: 1px solid #384255;
  border-radius: 8px;
  background: #111822;
  padding: 12px;
  display: grid;
  gap: 10px;
}

.module01-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.module01-section-heading h3 {
  margin: 0;
  font-size: 16px;
}

.module01-advanced-details {
  border: 1px solid #384255;
  border-radius: 8px;
  background: #10151d;
}

.module01-advanced-details summary {
  cursor: pointer;
  color: #ffd166;
  font-weight: 800;
  padding: 10px 12px;
}

.module01-advanced-body {
  border-top: 1px solid #303947;
  padding: 12px;
  display: grid;
  gap: 10px;
}
```

- [ ] **Step 5: Wrap the old walk and run content with the new section primitives**

In `SpriteAnimator.tsx`, import:

```ts
import {
  Module01ActionSection,
  Module01AdvancedDetails,
  Module01MediaGrid,
  Module01PageStage
} from "./module01/Module01Stage";
```

Convert the `walk` page first:

```tsx
{activePage === "walk" ? (
  <Module01PageStage
    title="步行"
    status={`${directionTemplateStatus} / ${videoStatus} / ${frameStatus}`}
    statusItems={[
      { label: "当前角色", value: activeCharacterId || "未选择", state: activeCharacterId ? "ready" : "missing" },
      { label: "基准模板", value: effectiveDirectionBaseTemplatePreview ? "已准备" : "缺少", state: effectiveDirectionBaseTemplatePreview ? "ready" : "missing" },
      { label: "步行结果", value: fourDirectionResult?.directions.length ? "已处理" : "未处理", state: fourDirectionResult?.directions.length ? "done" : "missing" }
    ]}
  >
    <Module01ActionSection title="步行图片">
      <Module01MediaGrid>
        <MediaPane title="角色基准模板">
          <ImagePreview alt="角色基准模板预览" preview={effectiveDirectionBaseTemplatePreview} emptyLabel="等待基准模板" />
        </MediaPane>
        <MediaPane title="步行 2x2">
          <ImagePreview alt="步行 2x2 输出预览" preview={walkDirectionOutputPreview ?? videoInputPreview} emptyLabel="先生成或上传步行 2x2" />
        </MediaPane>
      </Module01MediaGrid>
      {/* keep the existing walk image controls here */}
    </Module01ActionSection>
    <Module01ActionSection title="步行视频与一键处理">
      {/* keep the existing walk video upload/generate/process controls here */}
    </Module01ActionSection>
    <Module01ActionSection title="步行结果">
      <FourDirectionResultPanel result={fourDirectionResult} frameIndex={activeFrameIndex} isPlaying={isPlayingFrames} />
    </Module01ActionSection>
  </Module01PageStage>
) : null}
```

Use the same wrapper shape for `run` so the failing test can pass for at least walk and run before the next task refines every page.

- [ ] **Step 6: Run the focused test and verify progress**

Run:

```powershell
npm run test -w apps/web -- App.test.tsx
```

Expected: the section-label test still fails for idle, attack, or jump until Task 5, but walk and run sections are now queryable by role.

- [ ] **Step 7: Commit shared primitives**

Run:

```powershell
git add apps/web/src/components/module01/Module01Stage.tsx apps/web/src/components/SpriteAnimator.tsx apps/web/src/styles.css apps/web/test/App.test.tsx
git commit -m "Add module 01 page primitives"
```

---

## Task 3: Build Module Settings Center

**Files:**
- Create: `apps/web/src/components/module01/Module01Settings.tsx`
- Modify: `apps/web/src/components/SpriteAnimator.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/App.test.tsx`

- [ ] **Step 1: Replace the old global reference settings test**

In `apps/web/test/App.test.tsx`, replace `it("opens global reference image settings and uploads overrides outside character folders", ...)` with:

```tsx
it("opens module settings with references grouped under the owning step", async () => {
  openSpriteAnimator();

  fireEvent.click(screen.getByRole("button", { name: "模块设置" }));

  expect(screen.getByRole("heading", { name: "模块设置" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "参考图设置" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "基准模板设置" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "步行设置" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "待机设置" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "跑步设置" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "攻击 1 设置" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "跳跃设置" })).toBeInTheDocument();

  expect(screen.getByAltText("基准模板画风参考图预览")).toHaveAttribute(
    "src",
    "http://127.0.0.1:8787/style-references/cel-anime-south-facing.png"
  );

  fireEvent.click(screen.getByRole("button", { name: "跑步设置" }));
  expect(screen.getByAltText("跑步参考图预览")).toHaveAttribute(
    "src",
    "http://127.0.0.1:8787/direction-references/run-4dir.png"
  );
  expect(screen.getByLabelText("上传并覆盖跑步参考图")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("上传并覆盖跑步参考图"), {
    target: { files: [new File(["run"], "run.png", { type: "image/png" })] }
  });

  await screen.findByText(/跑步参考图已全局覆盖/);
  const uploadCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/module01/reference-images/run"));
  expect(uploadCall?.[1]).toMatchObject({ method: "POST" });
});
```

- [ ] **Step 2: Add a failing test that one-click no longer exposes prompt editors**

Add:

```tsx
it("keeps one-click generation focused on launch and progress", () => {
  openSpriteAnimator();

  fireEvent.click(screen.getByRole("button", { name: "一键生成" }));

  expect(screen.getByRole("heading", { name: "一键生成" })).toBeInTheDocument();
  expect(screen.getByLabelText("一键生成角色名称")).toBeInTheDocument();
  expect(screen.getByLabelText("一键生成角色参考图")).toBeInTheDocument();
  expect(screen.getByLabelText("一键生成跑步")).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "一键生成进度" })).toBeInTheDocument();
  expect(screen.queryByLabelText("一键生成系统提示词")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("一键生成最终图片提示词")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("一键生成图片尺寸")).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```powershell
npm run test -w apps/web -- App.test.tsx
```

Expected: settings and one-click tests fail against the old reference settings page and old one-click prompt panel.

- [ ] **Step 4: Create `Module01Settings`**

Create `apps/web/src/components/module01/Module01Settings.tsx`:

```tsx
import { Save, Upload } from "lucide-react";
import { useState, type ReactNode } from "react";
import { MODULE01_SETTINGS_GROUPS, type Module01SettingsGroup } from "./module01Model";

export interface Module01SettingsReference {
  group: Module01SettingsGroup;
  label: string;
  alt: string;
  previewUrl: string;
  onUpload: (file: File) => void | Promise<void>;
}

export interface Module01SettingsPanel {
  group: Module01SettingsGroup;
  content: ReactNode;
  onSave: () => void;
}

export function Module01Settings({
  status,
  references,
  panels
}: {
  status: string;
  references: readonly Module01SettingsReference[];
  panels: readonly Module01SettingsPanel[];
}) {
  const [activeGroup, setActiveGroup] = useState<Module01SettingsGroup>("base-template");
  const group = MODULE01_SETTINGS_GROUPS.find((item) => item.id === activeGroup) ?? MODULE01_SETTINGS_GROUPS[0];
  const activeReferences = references.filter((reference) => reference.group === activeGroup);
  const activePanel = panels.find((panel) => panel.group === activeGroup);

  return (
    <section className="workflow-stage module01-settings-center">
      <div className="stage-heading">
        <h2>模块设置</h2>
        <span>{status}</span>
      </div>
      <div className="module01-settings-layout">
        <nav className="module01-settings-nav" aria-label="模块设置分类">
          {MODULE01_SETTINGS_GROUPS.map((item) => (
            <button
              className={["nav-item", activeGroup === item.id ? "nav-item-active" : ""].filter(Boolean).join(" ")}
              key={item.id}
              type="button"
              onClick={() => setActiveGroup(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="module01-settings-content">
          <h3>{group.label}</h3>
          {activeReferences.length ? (
            <div className="module01-settings-references">
              {activeReferences.map((reference) => (
                <section className="module01-settings-reference" key={reference.label}>
                  <img alt={reference.alt} src={reference.previewUrl} />
                  <label className="file-picker">
                    <Upload size={16} /> 上传并覆盖{reference.label}
                    <input
                      aria-label={`上传并覆盖${reference.label}`}
                      className="visually-hidden"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void reference.onUpload(file);
                        }
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </section>
              ))}
            </div>
          ) : null}
          {activePanel?.content}
          {activePanel ? (
            <button className="tool-button" type="button" onClick={activePanel.onSave}>
              <Save size={16} /> {group.saveLabel}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Wire settings references and panels from `SpriteAnimator.tsx`**

Add a settings page conditional:

```tsx
{activePage === "module-settings" ? (
  <Module01Settings
    status={referenceSettingsStatus}
    references={[
      {
        group: "base-template",
        label: "基准模板画风参考图",
        alt: "基准模板画风参考图预览",
        previewUrl: builtInStyleReferencePreview?.url ?? toAbsoluteApiUrl(BUILT_IN_STYLE_REFERENCE_URL),
        onUpload: (file) => handleReferenceImageUpload("style", file)
      },
      {
        group: "walk",
        label: "步行参考图",
        alt: "步行参考图预览",
        previewUrl: builtInWalkReferencePreview?.url ?? toAbsoluteApiUrl(BUILT_IN_WALK_REFERENCE_URL),
        onUpload: (file) => handleReferenceImageUpload("walk", file)
      },
      {
        group: "idle",
        label: "待机参考图",
        alt: "待机参考图预览",
        previewUrl: builtInIdleReferencePreview?.url ?? toAbsoluteApiUrl(BUILT_IN_IDLE_REFERENCE_URL),
        onUpload: (file) => handleReferenceImageUpload("idle", file)
      },
      {
        group: "run",
        label: "跑步参考图",
        alt: "跑步参考图预览",
        previewUrl: builtInRunReferencePreview?.url ?? toAbsoluteApiUrl(BUILT_IN_RUN_REFERENCE_URL),
        onUpload: (file) => handleReferenceImageUpload("run", file)
      }
    ]}
    panels={[
      { group: "base-template", content: <BaseTemplateSettingsFields />, onSave: handleSaveFirstFrameDraft },
      { group: "walk", content: <WalkSettingsFields />, onSave: handleSaveDirectionTemplateDraft },
      { group: "idle", content: <IdleSettingsFields />, onSave: handleSaveDirectionTemplateDraft },
      { group: "run", content: <RunSettingsFields />, onSave: handleSaveVideoDraft },
      { group: "attack-1", content: <AttackSettingsFields />, onSave: handleSaveVideoDraft },
      { group: "jump", content: <JumpSettingsFields />, onSave: handleSaveVideoDraft },
      { group: "character-preview", content: <CharacterPreviewSettingsFields />, onSave: handleSavePreviewSettings },
      { group: "godot-export", content: <ExportSettingsFields />, onSave: handleSavePreviewSettings }
    ]}
  />
) : null}
```

Define the `*SettingsFields` components inside `SpriteAnimator.tsx` during this task as thin wrappers around existing controls. Use the existing labels for system prompt textareas so current tests can be updated rather than losing coverage.

- [ ] **Step 6: Remove old reference-settings page conditional**

Delete the old `activePage === "reference-settings"` `WorkflowStage` block after the new settings center passes the reference upload test.

- [ ] **Step 7: Add settings center CSS**

Append:

```css
.module01-settings-layout {
  display: grid;
  grid-template-columns: minmax(160px, 220px) minmax(0, 1fr);
  gap: 14px;
}

.module01-settings-nav {
  display: grid;
  gap: 8px;
  align-content: start;
}

.module01-settings-content {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.module01-settings-content h3 {
  margin: 0;
}

.module01-settings-references {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.module01-settings-reference {
  border: 1px solid #384255;
  border-radius: 8px;
  background: #10151d;
  padding: 10px;
  display: grid;
  gap: 10px;
}

.module01-settings-reference img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  background: #0d1219;
  border-radius: 6px;
}
```

- [ ] **Step 8: Run web tests and verify the settings tests pass**

Run:

```powershell
npm run test -w apps/web -- App.test.tsx
```

Expected: settings-center tests pass; old tests that expect prompt fields on main pages may still fail until later tasks update them.

- [ ] **Step 9: Commit settings center**

Run:

```powershell
git add apps/web/src/components/module01/Module01Settings.tsx apps/web/src/components/SpriteAnimator.tsx apps/web/src/styles.css apps/web/test/App.test.tsx
git commit -m "Add module 01 settings center"
```

---

## Task 4: Clean One-click And Base Template Pages

**Files:**
- Modify: `apps/web/src/components/SpriteAnimator.tsx`
- Modify: `apps/web/test/App.test.tsx`

- [ ] **Step 1: Add failing assertions for base template image-only behavior**

In the navigation/base template test, add:

```tsx
expect(screen.getByRole("heading", { name: "基准模板" })).toBeInTheDocument();
expect(screen.getByRole("region", { name: "基准模板图片" })).toBeInTheDocument();
expect(screen.queryByRole("region", { name: /视频与一键处理/ })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: /一键处理/i })).not.toBeInTheDocument();
expect(screen.getByLabelText("基准模板本次生成要求")).toBeInTheDocument();
expect(screen.queryByLabelText("系统提示词")).not.toBeInTheDocument();
expect(screen.queryByLabelText("最终图片提示词")).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm run test -w apps/web -- App.test.tsx
```

Expected: the old base page still exposes prompt panels and lacks the `基准模板图片` region.

- [ ] **Step 3: Rewrite base template content using `Module01PageStage`**

Replace the old `activePage === "base-template"` `WorkflowStage` with:

```tsx
{activePage === "base-template" ? (
  <Module01PageStage
    title="基准模板"
    status={firstFrameStatus}
    statusItems={[
      { label: "当前角色", value: activeCharacterId || "未选择", state: activeCharacterId ? "ready" : "missing" },
      { label: "角色参考图", value: characterReferencePreview ? "已准备" : "缺少", state: characterReferencePreview ? "ready" : "missing" },
      { label: "基准模板", value: firstFrameOutputPreview ? "已生成" : "未生成", state: firstFrameOutputPreview ? "done" : "missing" }
    ]}
  >
    <Module01ActionSection title="基准模板图片">
      <Module01MediaGrid>
        <MediaPane title="角色参考图">
          <ImagePreview alt="角色参考图预览" preview={characterReferencePreview} emptyLabel="等待角色参考图" />
        </MediaPane>
        <MediaPane title="基准模板">
          <ImagePreview alt="基准模板输出预览" preview={firstFrameOutputPreview} emptyLabel="等待基准模板" />
        </MediaPane>
      </Module01MediaGrid>
      <div className="control-row">
        <label className="file-picker">
          <Upload size={16} /> 上传角色参考图
          <input
            aria-label="上传角色参考图"
            className="visually-hidden"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                handleCharacterReferenceUpload(file);
              }
            }}
          />
        </label>
        <button className="tool-button primary" type="button" disabled={isProcessingFirstFrame} onClick={() => void handleProcessFirstFrame()}>
          <WandSparkles size={16} /> {isProcessingFirstFrame ? "处理中" : "生成基准模板"}
        </button>
      </div>
      <label className="field">
        本次生成要求
        <textarea
          aria-label="基准模板本次生成要求"
          value={imageCustomPrompt}
          rows={4}
          onChange={(event) => setImageCustomPrompt(event.target.value)}
        />
      </label>
      <div className="form-grid">
        <label className="field">
          图像模型
          <select aria-label="图像模型" value={imageModel} onChange={(event) => setImageModel(event.target.value)}>
            {imageModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
          </select>
        </label>
        <label className="field">
          图片生成尺寸
          <select aria-label="图片生成尺寸" value={imageGenerationSize} onChange={(event) => setImageGenerationSize(Number(event.target.value))}>
            {imageGenerationSizeOptions.map((option) => <option key={option.size} value={option.size}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <Module01AdvancedDetails>
        <div className="form-grid">
          <label className="field">
            图片风格
            <select aria-label="图片风格" value={imageStyle} onChange={(event) => setImageStyle(event.target.value)}>
              {IMAGE_STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
            </select>
          </label>
          <label className="field">
            抠图背景
            <input type="color" value={keyColor} onChange={(event) => setKeyColor(event.target.value)} />
          </label>
        </div>
      </Module01AdvancedDetails>
    </Module01ActionSection>
  </Module01PageStage>
) : null}
```

- [ ] **Step 4: Remove prompt footer from one-click page**

Delete the `footer={...}` prompt panel from the `one-click-character` page. Keep the progress panel and action checkboxes.

- [ ] **Step 5: Remove image model and size from one-click page**

In the one-click controls, remove the `图像模型` and `图片生成尺寸` fields. Keep `角色名称`, `图片风格`, reference upload, action checkboxes, and start button.

- [ ] **Step 6: Run web tests**

Run:

```powershell
npm run test -w apps/web -- App.test.tsx
```

Expected: one-click and base template tests pass. Tests expecting prompt fields on the base page should be updated to query Module Settings instead.

- [ ] **Step 7: Commit one-click and base cleanup**

Run:

```powershell
git add apps/web/src/components/SpriteAnimator.tsx apps/web/test/App.test.tsx
git commit -m "Clean module 01 one-click and base pages"
```

---

## Task 5: Align Walk And Idle Pages

**Files:**
- Modify: `apps/web/src/components/SpriteAnimator.tsx`
- Modify: `apps/web/test/App.test.tsx`

- [ ] **Step 1: Add tests for walk and idle page rules**

Add:

```tsx
it("keeps walk and idle action pages grouped by action", () => {
  openSpriteAnimator();

  fireEvent.click(screen.getByRole("button", { name: "步行" }));
  expect(screen.getByRole("region", { name: "步行图片" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "步行视频与一键处理" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /生成步行图片/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /生成步行视频/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /一键处理步行/i })).toBeInTheDocument();
  expect(screen.getByLabelText("步行图片本次生成要求")).toBeInTheDocument();
  expect(screen.getByLabelText("步行视频本次生成要求")).toBeInTheDocument();
  expect(screen.queryByLabelText("步行系统提示词")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("视频系统提示词")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "待机" }));
  expect(screen.getByRole("region", { name: "待机图片" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "待机一键处理" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /生成待机图片/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /一键处理待机/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /生成待机视频/i })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("待机系统提示词")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm run test -w apps/web -- App.test.tsx
```

Expected: the old walk and idle pages still use older section labels and prompt panels.

- [ ] **Step 3: Rewrite walk page into image, video/process, and result sections**

Use the existing handlers:

- Image: `handleGenerateDirectionTemplate("walk")`, `handleDirectionBaseTemplateUpload`, `handleVideoFirstFrameUpload`.
- Video: `handleSubmitVideo`, `handleFrameVideoUpload`.
- Processing: `handleProcessFourDirection`.
- Result: `FourDirectionResultPanel`.

Keep visible common fields:

```tsx
<div className="form-grid">
  <label className="field">
    图像模型
    <select aria-label="步行图像模型" value={directionImageModel} onChange={(event) => setDirectionImageModel(event.target.value)}>
      {imageModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
    </select>
  </label>
  <label className="field">
    图片生成尺寸
    <select aria-label="步行图片生成尺寸" value={directionImageGenerationSize} onChange={(event) => setDirectionImageGenerationSize(Number(event.target.value))}>
      {directionImageGenerationSizeOptions.map((option) => <option key={option.size} value={option.size}>{option.label}</option>)}
    </select>
  </label>
</div>
```

Move processing details under `Module01AdvancedDetails`:

```tsx
<Module01AdvancedDetails title="一键处理高级设置">
  <div className="form-grid">
    <label className="field">
      抽帧数量
      <input aria-label="抽帧数量" type="number" min={1} max={120} value={frameCount} onChange={(event) => setFrameCount(clamp(Number(event.target.value), 1, 120))} />
    </label>
    <label className="field">
      预览 FPS
      <input aria-label="预览 FPS" type="number" min={1} max={FPS_MAX} value={fps} onChange={(event) => setFps(clamp(Number(event.target.value), 1, FPS_MAX))} />
    </label>
    <label className="field">
      抠图容差
      <input aria-label="抠图容差" type="number" min={0} max={255} value={tolerance} onChange={(event) => setTolerance(clamp(Number(event.target.value), 0, 255))} />
    </label>
    <label className="field">
      最小循环帧数
      <input aria-label="最小循环帧数" type="number" min={2} max={120} value={minLoopFrames} onChange={(event) => setMinLoopFrames(clamp(Number(event.target.value), 2, 120))} />
    </label>
    <label className="field">
      最大循环帧数
      <input aria-label="最大循环帧数" type="number" min={2} max={120} value={maxLoopFrames} onChange={(event) => setMaxLoopFrames(clamp(Number(event.target.value), 2, 120))} />
    </label>
  </div>
</Module01AdvancedDetails>
```

- [ ] **Step 4: Rewrite idle page into image, one-click processing, and result sections**

Use the existing handlers:

- Image: `handleGenerateDirectionTemplate("idle")`.
- Processing: `handleProcessIdleDirection`.
- Result: `IdleDirectionPreviewGrid`, `IdleSpriteSheetPreview`, download links.

Do not render `handleSubmitVideo`, video model, video duration, or video resolution controls on the idle page.

- [ ] **Step 5: Update old workflow tests to new labels**

In tests that click old labels:

- Replace `步行四方向` with `步行`.
- Replace `待机四方向` with `待机`.
- Replace `/生成步行四方向图/i` with `/生成步行图片/i`.
- Replace `/基于步行图生成待机四方向图/i` with `/生成待机图片/i`.
- Replace `/一键处理步行循环/i` with `/一键处理步行/i`.
- Replace `/一键处理待机四方向/i` with `/一键处理待机/i`.

- [ ] **Step 6: Run web tests**

Run:

```powershell
npm run test -w apps/web -- App.test.tsx
```

Expected: walk and idle tests pass; advanced action tests still fail until Task 6.

- [ ] **Step 7: Commit walk and idle alignment**

Run:

```powershell
git add apps/web/src/components/SpriteAnimator.tsx apps/web/test/App.test.tsx
git commit -m "Align module 01 walk and idle pages"
```

---

## Task 6: Align Run, Attack 1, And Jump Pages

**Files:**
- Create: `apps/web/src/components/module01/Module01ActionPage.tsx`
- Modify: `apps/web/src/components/SpriteAnimator.tsx`
- Modify: `apps/web/test/App.test.tsx`

- [ ] **Step 1: Add tests for advanced-action layout**

Replace `it("opens advanced character generation pages", ...)` with:

```tsx
it("opens aligned run attack and jump action pages", () => {
  openSpriteAnimator();

  fireEvent.click(screen.getByRole("button", { name: "跑步" }));
  expect(screen.getByRole("heading", { name: "跑步" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "跑步图片" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "跑步视频与一键处理" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /生成跑步首帧/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /生成跑步视频/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /一键处理跑步/i })).toBeInTheDocument();
  expect(screen.queryByLabelText("跑步首帧系统提示词")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("跑步视频系统提示词")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "攻击 1" }));
  expect(screen.getByRole("heading", { name: "攻击 1" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "攻击 1 图片" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "攻击 1 视频与一键处理" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /准备攻击起始帧/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /生成攻击中间帧/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /生成攻击视频/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /一键处理攻击/i })).toBeInTheDocument();
  expect(screen.getByLabelText("攻击中间帧本次生成要求")).toBeInTheDocument();
  expect(screen.queryByLabelText("攻击中间帧自定义提示词")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "跳跃" }));
  expect(screen.getByRole("heading", { name: "跳跃" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "跳跃图片" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "跳跃视频与一键处理" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /准备跳跃起始帧/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /生成跳跃视频/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /一键处理跳跃/i })).toBeInTheDocument();
  expect(screen.queryByLabelText("跳跃四方向准备缩放比例")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm run test -w apps/web -- App.test.tsx
```

Expected: the old advanced action page uses old labels and exposes system prompts/start scale directly.

- [ ] **Step 3: Create a small reusable action page wrapper**

Create `apps/web/src/components/module01/Module01ActionPage.tsx`:

```tsx
import type { ReactNode } from "react";
import { Module01ActionSection, Module01PageStage, type Module01StatusItem } from "./Module01Stage";

export function Module01ActionPage({
  title,
  status,
  statusItems,
  image,
  video,
  result
}: {
  title: string;
  status: string;
  statusItems?: readonly Module01StatusItem[];
  image?: ReactNode;
  video?: ReactNode;
  result?: ReactNode;
}) {
  return (
    <Module01PageStage title={title} status={status} statusItems={statusItems}>
      {image ? <Module01ActionSection title={`${title}图片`}>{image}</Module01ActionSection> : null}
      {video ? <Module01ActionSection title={`${title}视频与一键处理`}>{video}</Module01ActionSection> : null}
      {result ? <Module01ActionSection title={`${title}结果`}>{result}</Module01ActionSection> : null}
    </Module01PageStage>
  );
}
```

- [ ] **Step 4: Rewrite the run page with `Module01ActionPage`**

Use:

- Image block: walk input + run keyframe, `handleGenerateRunKeyframe`.
- Video block: `handleSubmitAdvancedVideo("run")`, a new page-level upload control that calls `uploadFrameVideoAsset(file, { characterId: activeCharacterId, actionKind: "run" })`, and `handleProcessAdvancedAction("run")`.
- Result block: `FourDirectionResultPanel` when `advancedActions.run.result` exists.

Visible prompt field:

```tsx
<label className="field">
  本次生成要求
  <textarea
    aria-label="跑步首帧本次生成要求"
    value={advancedRunCustomPrompt}
    rows={4}
    onChange={(event) => setAdvancedRunCustomPrompt(event.target.value)}
  />
</label>
```

Use a second visible prompt field for video:

```tsx
<label className="field">
  本次视频要求
  <textarea
    aria-label="跑步视频本次生成要求"
    value={advancedRunVideoCustomPrompt}
    rows={4}
    onChange={(event) => setAdvancedRunVideoCustomPrompt(event.target.value)}
  />
</label>
```

Move system/final prompt textareas into Module Settings.

- [ ] **Step 5: Rewrite attack page**

Use:

- Image block: idle input, attack start frame, attack middle frame, `handlePrepareAdvancedStartFrame("attack-1")`, `handleGenerateAttackMidframe`.
- Video block: `handleSubmitAdvancedVideo("attack-1")`, a new page-level upload control that calls `uploadFrameVideoAsset(file, { characterId: activeCharacterId, actionKind: "attack-1" })`, and `handleProcessAdvancedAction("attack-1")`.
- Result block: `FourDirectionResultPanel` for `advancedActions["attack-1"].result`.

Rename the visible middle-frame prompt label to:

```tsx
<textarea
  aria-label="攻击中间帧本次生成要求"
  value={advancedAttackMidframeCustomPrompt}
  rows={4}
  onChange={(event) => setAdvancedAttackMidframeCustomPrompt(event.target.value)}
/>
```

Move `advancedAttackStartScale` into `Module01AdvancedDetails` with label `攻击起始帧缩放比例`.

- [ ] **Step 6: Rewrite jump page**

Use:

- Image block: idle input + prepared jump start frame, `handlePrepareAdvancedStartFrame("jump")`.
- Video block: `handleSubmitAdvancedVideo("jump")`, a new page-level upload control that calls `uploadFrameVideoAsset(file, { characterId: activeCharacterId, actionKind: "jump" })`, and `handleProcessAdvancedAction("jump")`.
- Result block: `FourDirectionResultPanel` for `advancedActions.jump.result`.

Move `advancedJumpStartScale` into `Module01AdvancedDetails` with label `跳跃起始帧缩放比例`.

- [ ] **Step 7: Update advanced action behavior tests**

For the attack video generation test:

- Replace navigation button `攻击四方向1` with `攻击 1`.
- Replace label `攻击四方向1准备缩放比例` with `攻击起始帧缩放比例` if the test opens advanced settings.
- Replace label `攻击中间帧自定义提示词` with `攻击中间帧本次生成要求`.
- Keep the payload expectation unchanged.

- [ ] **Step 8: Run web tests**

Run:

```powershell
npm run test -w apps/web -- App.test.tsx
```

Expected: advanced action tests pass, and payload tests still prove existing API behavior.

- [ ] **Step 9: Commit advanced action alignment**

Run:

```powershell
git add apps/web/src/components/module01/Module01ActionPage.tsx apps/web/src/components/SpriteAnimator.tsx apps/web/test/App.test.tsx
git commit -m "Align module 01 advanced action pages"
```

---

## Task 7: Final Copy, Styling, And Verification

**Files:**
- Modify: `apps/web/src/components/SpriteAnimator.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/App.test.tsx`

- [ ] **Step 1: Add a wording regression test**

Add:

```tsx
it("does not expose frame-cutting wording in module 01", () => {
  openSpriteAnimator();

  expect(screen.queryByText(/切帧/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /切帧/ })).not.toBeInTheDocument();

  for (const page of ["步行", "待机", "跑步", "攻击 1", "跳跃"]) {
    fireEvent.click(screen.getByRole("button", { name: page }));
    expect(screen.queryByText(/切帧/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /切帧/ })).not.toBeInTheDocument();
  }
});
```

- [ ] **Step 2: Run the wording test and verify it fails if old wording remains**

Run:

```powershell
npm run test -w apps/web -- App.test.tsx
```

Expected: fails if any visible text still uses `切帧`.

- [ ] **Step 3: Remove old visible copy and dead page branches**

In `SpriteAnimator.tsx`:

- Remove visible `切帧` wording.
- Remove old `reference-settings`, `direction-templates`, `walk-videos`, `advanced-run`, `advanced-attack-1`, and `advanced-jump` page id branches.
- Keep backend route names and API client names unchanged.
- Keep saved draft migration logic so old localStorage drafts still load.

- [ ] **Step 4: Add responsive style polish**

In `apps/web/src/styles.css`, update the mobile media query so action sections remain readable:

```css
@media (max-width: 900px) {
  .module01-settings-layout {
    grid-template-columns: 1fr;
  }

  .module01-settings-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .module01-status-grid,
  .stage-media-grid,
  .stage-media-grid-three,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .module01-action-section {
    padding: 10px;
  }
}
```

- [ ] **Step 5: Run full web tests**

Run:

```powershell
npm run test -w apps/web
```

Expected: all web tests pass.

- [ ] **Step 6: Run server tests**

Run:

```powershell
npm run test -w apps/server
```

Expected: all server tests pass. Failures indicate an accidental API behavior change.

- [ ] **Step 7: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: server, web, and core typechecks pass.

- [ ] **Step 8: Start the workbench dev server for manual UI verification**

Run:

```powershell
npm run dev:workbench
```

Expected: Vite prints the web URL and the server remains running.

- [ ] **Step 9: Verify the UI in browser**

Open the Vite URL and check:

- Module 01 opens on `基准模板`.
- Left nav shows one item per action.
- `模块设置` groups references under the owning action.
- Base page has no video section.
- Walk/run/attack/jump pages use the same section order.
- Idle does not show irrelevant video generation controls.
- No visible copy says `切帧`.

- [ ] **Step 10: Commit final cleanup**

Run:

```powershell
git add apps/web/src/components/SpriteAnimator.tsx apps/web/src/styles.css apps/web/test/App.test.tsx
git commit -m "Polish module 01 cleanup"
```

---

## Final Verification

Run:

```powershell
npm run test -w apps/web
npm run test -w apps/server
npm run typecheck
```

All commands must pass before reporting completion. If a dev server was started for verification, leave it running only if the user needs to inspect it; otherwise stop it before final response.

## Self-Review Notes

- Spec coverage: navigation, one-click scope, base image-only page, action grouped pages, settings center, parameter visibility, state/prerequisite messaging, component split, and wording are covered by Tasks 1 through 7.
- Placeholder scan: the plan uses concrete file paths, test snippets, component skeletons, commands, and expected outcomes.
- Type consistency: page ids are defined in `module01Model.ts`; later tasks use the same ids and labels.
