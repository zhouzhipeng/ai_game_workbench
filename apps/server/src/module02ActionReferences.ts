import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Module02ActionReferenceId = "idle" | "walk";

const MODULE02_ACTION_REFERENCE_DEFINITIONS: Record<Module02ActionReferenceId, {
  fileName: string;
  routePath: string;
}> = {
  idle: {
    fileName: "idle-2x2-centered.png",
    routePath: "/module02/action-references/idle-2x2-centered.png"
  },
  walk: {
    fileName: "walk-4x10-no-shadow.png",
    routePath: "/module02/action-references/walk-4x10-no-shadow.png"
  }
};

export function isModule02ActionReferenceId(value: string | undefined): value is Module02ActionReferenceId {
  return value === "idle" || value === "walk";
}

export function getModule02ActionReferenceFileName(actionId: Module02ActionReferenceId): string {
  return MODULE02_ACTION_REFERENCE_DEFINITIONS[actionId].fileName;
}

export function getModule02ActionReferenceUrl(actionId: Module02ActionReferenceId): string {
  return MODULE02_ACTION_REFERENCE_DEFINITIONS[actionId].routePath;
}

export function resolveModule02ActionReferenceOverridePath(
  storageDir: string,
  actionId: Module02ActionReferenceId
): string {
  return join(storageDir, "config", "module02-action-references", getModule02ActionReferenceFileName(actionId));
}

export function resolveModule02ActionReferencePath(
  storageDir: string,
  referenceImage: string
): string {
  const actionId = findModule02ActionReferenceIdByFileName(referenceImage);
  if (actionId) {
    const overridePath = resolveModule02ActionReferenceOverridePath(storageDir, actionId);
    if (existsSync(overridePath)) {
      return overridePath;
    }
  }
  return resolveBundledModule02ActionReferencePath(referenceImage);
}

export function readModule02ActionReferenceBuffer(
  storageDir: string,
  referenceImage: string
): Promise<Buffer> {
  return readFile(resolveModule02ActionReferencePath(storageDir, referenceImage));
}

function findModule02ActionReferenceIdByFileName(fileName: string): Module02ActionReferenceId | undefined {
  const safeFileName = basename(fileName);
  return (Object.entries(MODULE02_ACTION_REFERENCE_DEFINITIONS) as Array<[Module02ActionReferenceId, { fileName: string }]>)
    .find(([, definition]) => definition.fileName === safeFileName)?.[0];
}

function resolveBundledModule02ActionReferencePath(referenceImage: string): string {
  const safeFileName = basename(referenceImage);
  const candidates = [
    fileURLToPath(new URL(`./assets/module02-action-references/${safeFileName}`, import.meta.url)),
    fileURLToPath(new URL(`../src/assets/module02-action-references/${safeFileName}`, import.meta.url)),
    join(process.cwd(), "src", "assets", "module02-action-references", safeFileName),
    join(process.cwd(), "assets", "module02-action-references", safeFileName)
  ] as const;
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}
