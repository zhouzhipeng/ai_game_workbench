export interface BuildExportNamesInput {
  assetKey: string;
  animationKey: string;
  frameIndex: number;
}

export interface ExportNames {
  baseName: string;
  sheetName: string;
  previewGifName: string;
  frameName: string;
}

export function sanitizeKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized : "asset";
}

export function buildExportNames(input: BuildExportNamesInput): ExportNames {
  const baseName = `${sanitizeKey(input.assetKey)}_${sanitizeKey(input.animationKey)}`;
  const frameNumber = String(input.frameIndex).padStart(3, "0");
  return {
    baseName,
    sheetName: `${baseName}_sheet.png`,
    previewGifName: `${baseName}_preview.gif`,
    frameName: `${baseName}_${frameNumber}.png`
  };
}
