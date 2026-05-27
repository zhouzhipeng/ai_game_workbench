# Three Stage Sprite Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the first AI sprite animation module with a three-stage Chinese workflow for first-frame processing, video generation, and frame processing.

**Architecture:** Keep the existing Vite React/Fastify workspace. The frontend owns workflow state and polling; the backend owns OpenRouter payloads, video job status, downloads into `storage/jobs/<jobId>/source.mp4`, and ffmpeg/sharp frame extraction into static job assets.

**Tech Stack:** React 19, Vite, Fastify, OpenRouter video/image APIs, ffmpeg-static, sharp, Vitest, Testing Library.

---

### Task 1: Backend Video Defaults And Job Assets

**Files:**
- Modify: `apps/server/src/providers/openRouter.ts`
- Modify: `apps/server/src/routes/generation.ts`
- Modify: `apps/server/src/routes/assets.ts`
- Test: `apps/server/test/openRouter.test.ts`
- Test: `apps/server/test/generationRoute.test.ts`

- [ ] Write failing tests for fixed `1:1`/`720p`/no-audio payloads, model-specific shortest duration, and status download to `/jobs/<jobId>/source.mp4`.
- [ ] Run the server tests and confirm the new tests fail.
- [ ] Add model duration defaults and normalized video job status/download handling.
- [ ] Run the server tests and confirm they pass.

### Task 2: Backend Frame Processing

**Files:**
- Modify: `apps/server/src/processing/ffmpeg.ts`
- Modify: `apps/server/src/routes/processing.ts`
- Test: `apps/server/test/ffmpeg.test.ts`
- Test: `apps/server/test/processingRoute.test.ts`

- [ ] Write failing tests for exact target frame extraction args and the processing route response shape.
- [ ] Run the server tests and confirm the new tests fail.
- [ ] Add frame extraction from saved source video, color key removal, and static frame URLs.
- [ ] Run the server tests and confirm they pass.

### Task 3: Three-Stage Chinese Frontend

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Replace: `apps/web/src/components/SpriteAnimator.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/App.test.tsx`

- [ ] Write failing tests for the three visible stages, upload/input preview, first-frame output feeding video input, video submit/poll/download preview, frame processing preview, play/stop controls, and saved prompt overwrite.
- [ ] Run the web tests and confirm the new tests fail.
- [ ] Replace the current module UI with the vertical workflow and simplified video parameters.
- [ ] Run the web tests and confirm they pass.

### Task 4: Manual Browser Verification

**Files:**
- No source changes unless verification exposes a bug.

- [ ] Start or reuse the backend, ngrok, and Vite web server.
- [ ] Open `http://127.0.0.1:5173/` in the in-app browser.
- [ ] Click every workflow button: back, save, upload, first-frame processing, video submit, frame processing, frame hide/unhide, play, pause, stop.
- [ ] Fix any verified defects with a failing test first, then rerun tests.
