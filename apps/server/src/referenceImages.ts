import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Module01ReferenceImageKind = "style" | "walk" | "idle" | "run";

const REFERENCE_IMAGE_DEFINITIONS: Record<Module01ReferenceImageKind, {
  fileName: string;
  routePath: string;
  assetSubdir: string;
}> = {
  style: {
    fileName: "cel-anime-south-facing.png",
    routePath: "/style-references/cel-anime-south-facing.png",
    assetSubdir: "style-references"
  },
  walk: {
    fileName: "walk-4dir.png",
    routePath: "/direction-references/walk-4dir.png",
    assetSubdir: "direction-references"
  },
  idle: {
    fileName: "idle-4dir.png",
    routePath: "/direction-references/idle-4dir.png",
    assetSubdir: "direction-references"
  },
  run: {
    fileName: "run-4dir.png",
    routePath: "/direction-references/run-4dir.png",
    assetSubdir: "direction-references"
  }
};

export function isModule01ReferenceImageKind(value: string | undefined): value is Module01ReferenceImageKind {
  return value === "style" || value === "walk" || value === "idle" || value === "run";
}

export function getModule01ReferenceImageFileName(kind: Module01ReferenceImageKind): string {
  return REFERENCE_IMAGE_DEFINITIONS[kind].fileName;
}

export function getModule01ReferenceImageUrl(kind: Module01ReferenceImageKind): string {
  return REFERENCE_IMAGE_DEFINITIONS[kind].routePath;
}

export function resolveModule01ReferenceImageOverridePath(
  storageDir: string,
  kind: Module01ReferenceImageKind
): string {
  return join(storageDir, "config", "reference-images", getModule01ReferenceImageFileName(kind));
}

export function resolveModule01ReferenceImagePath(
  storageDir: string,
  kind: Module01ReferenceImageKind
): string {
  const overridePath = resolveModule01ReferenceImageOverridePath(storageDir, kind);
  if (existsSync(overridePath)) {
    return overridePath;
  }
  return resolveBundledReferenceImagePath(kind);
}

export function readModule01ReferenceImageBuffer(
  storageDir: string,
  kind: Module01ReferenceImageKind
): Promise<Buffer> {
  return readFile(resolveModule01ReferenceImagePath(storageDir, kind));
}

function resolveBundledReferenceImagePath(kind: Module01ReferenceImageKind): string {
  const definition = REFERENCE_IMAGE_DEFINITIONS[kind];
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(moduleDir, "assets", definition.assetSubdir, definition.fileName),
    join(moduleDir, "..", "src", "assets", definition.assetSubdir, definition.fileName),
    join(process.cwd(), "src", "assets", definition.assetSubdir, definition.fileName),
    join(process.cwd(), "assets", definition.assetSubdir, definition.fileName)
  ] as const;
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}
