import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import type { AppConfig } from "../config";
import {
  ensureCharacterFolder,
  normalizeCharacterId,
  resolveCharacterPath,
} from "../characterStorage";

type GDevelopExtensionExportRouteConfig = Pick<AppConfig, "storageDir" | "module01CharacterExportDir">;
type FourDirectionKey = "down" | "up" | "left" | "right";
type CharacterActionKey = "idle" | "walk" | "run" | "attack1" | "jump";

interface GDevelopExtensionAssetFile {
  resourceName: string;
  relativePath: string;
  sourcePath: string;
  url: string;
}

interface GDevelopAnimationManifestEntry {
  name: string;
  action: CharacterActionKey;
  direction: FourDirectionKey;
  fps: number;
  loop: boolean;
  frames: GDevelopExtensionAssetFile[];
}

interface GDevelopExtensionManifest {
  characterId: string;
  frameSize: number;
  extensionName: string;
  extensionVersion: string;
  objectType: string;
  directions: FourDirectionKey[];
  animations: GDevelopAnimationManifestEntry[];
}

interface ActionDefinition {
  action: CharacterActionKey;
  sourceSegments: readonly string[];
  fps: number;
  loop: boolean;
  singleDirectionFile?: boolean;
}

const GDEVELOP_EXTENSION_EXPORT_SIZES = [256, 384, 512, 1024] as const;
const DIRECTION_KEYS: readonly FourDirectionKey[] = ["down", "up", "left", "right"];
const ACTION_DEFINITIONS: readonly ActionDefinition[] = [
  {
    action: "idle",
    sourceSegments: ["base-character", "loop-export", "idle", "transparent"],
    fps: 12,
    loop: true,
    singleDirectionFile: true
  },
  {
    action: "walk",
    sourceSegments: ["base-character", "loop-export", "transparent"],
    fps: 30,
    loop: true
  },
  {
    action: "run",
    sourceSegments: ["advanced-character", "run", "export", "transparent"],
    fps: 30,
    loop: true
  },
  {
    action: "attack1",
    sourceSegments: ["advanced-character", "attack-1", "export", "transparent"],
    fps: 30,
    loop: false
  },
  {
    action: "jump",
    sourceSegments: ["advanced-character", "jump", "export", "transparent"],
    fps: 30,
    loop: false
  }
];

export function registerGDevelopExtensionExportRoutes(
  app: FastifyInstance,
  config: GDevelopExtensionExportRouteConfig
): void {
  app.post("/api/export/gdevelop-extension", async (request, reply) => {
    const input = request.body as {
      characterId?: string;
      exportSize?: number;
    };
    const characterId = input.characterId?.trim() ?? "";
    const exportSize = input.exportSize ?? 512;
    if (!isGDevelopExtensionExportSize(exportSize)) {
      return reply.code(400).send({
        error: `GDevelop extension export size must be one of ${GDEVELOP_EXTENSION_EXPORT_SIZES.join(" / ")}.`
      });
    }

    try {
      await ensureCharacterFolder(config.storageDir, characterId);
      const result = await exportGDevelopExtension({
        storageDir: config.storageDir,
        exportDir: config.module01CharacterExportDir,
        characterId,
        exportSize
      });
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "GDevelop extension export failed.";
      return reply.code(message.includes("no animation frames") ? 404 : 400).send({ error: message });
    }
  });
}

async function exportGDevelopExtension(input: {
  storageDir: string;
  exportDir: string;
  characterId: string;
  exportSize: (typeof GDEVELOP_EXTENSION_EXPORT_SIZES)[number];
}) {
  const characterId = normalizeCharacterId(input.characterId);
  const safeCharacterName = toSafeIdentifier(characterId, "Character");
  const extensionName = `AICharacter_${safeCharacterName}`;
  const extensionVersion = makeExtensionVersion();
  const objectName = "Character";
  const defaultObjectName = safeCharacterName;
  const characterExportRoot = resolveExportPath(input.exportDir, characterId);
  await rm(characterExportRoot, { recursive: true, force: true });
  const exportRoot = resolveExportPath(input.exportDir, characterId, `gdevelop-extension-${input.exportSize}`);
  const assetsRoot = join(exportRoot, "assets");
  await mkdir(assetsRoot, { recursive: true });

  const filesForZip: Record<string, Buffer> = {};
  const manifest: GDevelopExtensionManifest = {
    characterId,
    frameSize: input.exportSize,
    extensionName,
    extensionVersion,
    objectType: `${extensionName}::${objectName}`,
    directions: [...DIRECTION_KEYS],
    animations: []
  };
  const exportedActions = new Set<CharacterActionKey>();
  const assetFiles: GDevelopExtensionAssetFile[] = [];

  for (const actionDefinition of ACTION_DEFINITIONS) {
    for (const direction of DIRECTION_KEYS) {
      const sourceFrames = await readActionDirectionFrames(input.storageDir, characterId, actionDefinition, direction);
      if (sourceFrames.length === 0) {
        continue;
      }

      const animationFrames: GDevelopExtensionAssetFile[] = [];
      const animationName = `${actionDefinition.action}_${direction}`;
      const outputDir = join(assetsRoot, actionDefinition.action, direction);
      await mkdir(outputDir, { recursive: true });
      for (const [index, sourceFrame] of sourceFrames.entries()) {
        const outputName = `${String(index).padStart(3, "0")}.png`;
        const assetRelativePath = normalizeZipPath(join(
          "assets",
          "ai-game-workbench",
          characterId,
          `size-${input.exportSize}`,
          actionDefinition.action,
          direction,
          outputName
        ));
        const zipAssetPath = assetRelativePath;
        const outputPath = join(outputDir, outputName);
        const outputBuffer = await resizeFrameForGDevelop(sourceFrame.buffer, input.exportSize);
        await writeFile(outputPath, outputBuffer);
        filesForZip[zipAssetPath] = outputBuffer;

        const assetFile = {
          resourceName: assetRelativePath,
          relativePath: assetRelativePath,
          sourcePath: outputPath,
          url: toCharacterExportUrl(characterId, `gdevelop-extension-${input.exportSize}`, "assets", actionDefinition.action, direction, outputName)
        };
        assetFiles.push(assetFile);
        animationFrames.push(assetFile);
      }

      exportedActions.add(actionDefinition.action);
      manifest.animations.push({
        name: animationName,
        action: actionDefinition.action,
        direction,
        fps: actionDefinition.fps,
        loop: actionDefinition.loop,
        frames: animationFrames
      });
    }
  }

  if (manifest.animations.length === 0) {
    throw new Error("The current character has no animation frames to export. Finish idle, walk, or advanced action processing first.");
  }

  const extension = buildGDevelopExtension({
    characterId,
    extensionName,
    extensionVersion,
    objectName,
    defaultObjectName,
    exportSize: input.exportSize,
    animations: manifest.animations
  });
  const extensionBuffer = Buffer.from(`${JSON.stringify(extension, null, 2)}\n`, "utf8");
  const manifestBuffer = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(join(exportRoot, "gdevelop-extension.json"), extensionBuffer);
  await writeFile(join(exportRoot, "manifest.json"), manifestBuffer);
  filesForZip["gdevelop-extension.json"] = extensionBuffer;
  filesForZip["manifest.json"] = manifestBuffer;
  await writeZipFile(join(exportRoot, "gdevelop-extension-package.zip"), filesForZip);

  return {
    characterId,
    exportSize: input.exportSize,
    extensionName,
    extensionVersion,
    objectType: `${extensionName}::${objectName}`,
    exportedActions: [...exportedActions],
    animationCount: manifest.animations.length,
    assetCount: assetFiles.length,
    assetFiles,
    extension,
    exportRootPath: exportRoot,
    exportRootUrl: toCharacterExportUrl(characterId, `gdevelop-extension-${input.exportSize}`),
    extensionUrl: toCharacterExportUrl(characterId, `gdevelop-extension-${input.exportSize}`, "gdevelop-extension.json"),
    manifestUrl: toCharacterExportUrl(characterId, `gdevelop-extension-${input.exportSize}`, "manifest.json"),
    packageUrl: toCharacterExportUrl(characterId, `gdevelop-extension-${input.exportSize}`, "gdevelop-extension-package.zip")
  };
}

async function readActionDirectionFrames(
  storageDir: string,
  characterId: string,
  action: ActionDefinition,
  direction: FourDirectionKey
): Promise<{ fileName: string; buffer: Buffer }[]> {
  if (action.singleDirectionFile) {
    const path = resolveCharacterPath(storageDir, characterId, ...action.sourceSegments, `${direction}.png`);
    if (!existsSync(path)) {
      return [];
    }
    return [{
      fileName: `${direction}.png`,
      buffer: await readFile(path)
    }];
  }

  const directory = resolveCharacterPath(storageDir, characterId, ...action.sourceSegments, direction);
  if (!existsSync(directory)) {
    return [];
  }
  const frameNames = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
    .map((entry) => entry.name)
    .sort(compareFrameNames);
  const frames = [];
  for (const fileName of frameNames) {
    frames.push({
      fileName,
      buffer: await readFile(join(directory, fileName))
    });
  }
  return frames;
}

async function resizeFrameForGDevelop(buffer: Buffer, exportSize: number): Promise<Buffer> {
  return sharp(buffer)
    .resize(exportSize, exportSize, {
      fit: "contain",
      kernel: sharp.kernel.lanczos3,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
}

function buildGDevelopExtension(input: {
  characterId: string;
  extensionName: string;
  extensionVersion: string;
  objectName: string;
  defaultObjectName: string;
  exportSize: number;
  animations: GDevelopAnimationManifestEntry[];
}) {
  return {
    author: "AI Game Workbench",
    category: "AI",
    dimension: "",
    extensionNamespace: input.extensionName,
    fullName: `${input.defaultObjectName} AI character`,
    gdevelopVersion: "",
    helpPath: "",
    iconUrl: "",
    name: input.extensionName,
    previewIconUrl: "",
    shortDescription: "Generated 2D character sprite animations.",
    version: input.extensionVersion,
    description: `Generated from AI Game Workbench character "${input.characterId}". Frames are ${input.exportSize}x${input.exportSize} transparent PNG resources.`,
    tags: ["ai", "character", "sprite", "animation"],
    authorIds: [],
    dependencies: [],
    globalVariables: [],
    sceneVariables: [],
    eventsFunctions: [],
    eventsFunctionsFolderStructure: {
      folderName: "__ROOT"
    },
    eventsBasedBehaviors: [],
    eventsBasedObjects: [
      {
        areaMaxX: input.exportSize,
        areaMaxY: input.exportSize,
        areaMaxZ: 64,
        areaMinX: 0,
        areaMinY: 0,
        areaMinZ: 0,
        defaultName: input.defaultObjectName,
        description: "Generated character object with configured Sprite animations.",
        fullName: `${input.defaultObjectName} Character`,
        helpPath: "",
        iconUrl: "",
        isAnimatable: true,
        isUsingLegacyInstancesRenderer: false,
        name: input.objectName,
        previewIconUrl: "",
        eventsFunctions: [],
        eventsFunctionsFolderStructure: {
          folderName: "__ROOT"
        },
        propertyDescriptors: [],
        propertiesFolderStructure: {
          folderName: "__ROOT"
        },
        objects: [],
        objectsFolderStructure: {
          folderName: "__ROOT"
        },
        objectsGroups: [],
        layers: [buildDefaultGDevelopLayer()],
        instances: [],
        editionSettings: {},
        variants: [
          {
            areaMaxX: input.exportSize,
            areaMaxY: input.exportSize,
            areaMaxZ: 64,
            areaMinX: 0,
            areaMinY: 0,
            areaMinZ: 0,
            name: "",
            objects: [buildGDevelopSpriteObject(input.animations)],
            objectsFolderStructure: buildGDevelopSpriteObjectFolderStructure(),
            objectsGroups: [],
            layers: [buildDefaultGDevelopLayer()],
            instances: [],
            editionSettings: {}
          }
        ]
      }
    ]
  };
}

function buildGDevelopSpriteObject(animations: GDevelopAnimationManifestEntry[]) {
  return {
    adaptCollisionMaskAutomatically: true,
    assetStoreId: "",
    name: "Sprite",
    type: "Sprite",
    updateIfNotVisible: true,
    variables: [],
    effects: [],
    behaviors: [],
    animations: animations.map((animation) => ({
      name: animation.name,
      useMultipleDirections: false,
      directions: [
        {
          looping: animation.loop,
          timeBetweenFrames: 1 / animation.fps,
          sprites: animation.frames.map((frame) => buildSpriteFrame(frame.resourceName))
        }
      ]
    }))
  };
}

function buildGDevelopSpriteObjectFolderStructure() {
  return {
    folderName: "__ROOT",
    children: [
      {
        objectName: "Sprite"
      }
    ]
  };
}

function buildDefaultGDevelopLayer() {
  return {
    ambientLightColorB: 200,
    ambientLightColorG: 200,
    ambientLightColorR: 200,
    camera2DPlaneMaxDrawingDistance: 5000,
    camera3DFarPlaneDistance: 10000,
    camera3DFieldOfView: 45,
    camera3DNearPlaneDistance: 3,
    cameraType: "",
    followBaseLayerCamera: false,
    isLightingLayer: false,
    isLocked: false,
    name: "",
    renderingType: "",
    visibility: true,
    cameras: [
      {
        defaultSize: true,
        defaultViewport: true,
        height: 0,
        viewportBottom: 1,
        viewportLeft: 0,
        viewportRight: 1,
        viewportTop: 0,
        width: 0
      }
    ],
    effects: []
  };
}

function buildSpriteFrame(resourceName: string) {
  return {
    hasCustomCollisionMask: true,
    image: resourceName,
    points: [],
    originPoint: {
      name: "origine",
      x: 0,
      y: 0
    },
    centerPoint: {
      automatic: true,
      name: "centre",
      x: 0,
      y: 0
    },
    customCollisionMask: []
  };
}

function compareFrameNames(first: string, second: string): number {
  const firstNumber = inferFrameNumber(first);
  const secondNumber = inferFrameNumber(second);
  if (firstNumber !== secondNumber) {
    return firstNumber - secondNumber;
  }
  return first.localeCompare(second, "en");
}

function inferFrameNumber(fileName: string): number {
  const match = fileName.match(/(\d+)(?=\.[^.]+$)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function isGDevelopExtensionExportSize(value: number): value is (typeof GDEVELOP_EXTENSION_EXPORT_SIZES)[number] {
  return GDEVELOP_EXTENSION_EXPORT_SIZES.includes(value as (typeof GDEVELOP_EXTENSION_EXPORT_SIZES)[number]);
}

function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function resolveExportPath(exportDir: string, characterId: string, ...segments: string[]): string {
  const root = resolve(exportDir);
  const target = resolve(root, normalizeCharacterId(characterId), ...segments);
  ensurePathInside(root, target);
  return target;
}

function ensurePathInside(root: string, target: string): void {
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  if (target !== root && !target.startsWith(normalizedRoot)) {
    throw new Error("Export path escapes the configured export directory.");
  }
}

function toCharacterExportUrl(characterId: string, ...segments: string[]): string {
  const encoded = [normalizeCharacterId(characterId), ...segments].map((segment) => encodeURIComponent(segment));
  return `/exports/character-2d/${encoded.join("/")}`;
}

function makeExtensionVersion(): string {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0")
  ].join("");
  return `1.0.${stamp}`;
}

function toSafeIdentifier(value: string, fallback: string): string {
  const sanitized = value
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  const withFallback = sanitized || fallback;
  return /^[A-Za-z_]/.test(withFallback) ? withFallback : `Character_${withFallback}`;
}

async function writeZipFile(path: string, files: Record<string, Buffer>): Promise<void> {
  const entries = Object.entries(files);
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, data] of entries) {
    const nameBuffer = Buffer.from(normalizeZipPath(name), "utf8");
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  await writeFile(path, Buffer.concat([...localParts, ...centralParts, end]));
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
