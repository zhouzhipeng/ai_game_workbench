import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpriteAnimator } from "../src/components/SpriteAnimator";

const fetchMock = vi.fn();
const APIMART_IMAGE_MODEL = "apimart/gpt-image-2";
const NANO_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";
const SEEDANCE_1_MODEL = "apimart/seedance-1.0-pro-quality";

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/api/provider-models")) {
      return jsonResponse(makeProviderModelCatalog());
    }
    if (url.endsWith("/api/runtime-config")) {
      return jsonResponse({
        publicAssetBaseUrl: "https://assets.example.com/assets",
        publicTunnelProvider: "cloudflare-quick-tunnel",
        publicTunnelUrl: "https://assets.example.com"
      });
    }
    if (url.endsWith("/api/module01/workflow-config")) {
      return jsonResponse({ config: null });
    }
    if (url.endsWith("/api/module01/characters")) {
      return jsonResponse({ characters: [] });
    }
    if (init?.method === "PUT") {
      return jsonResponse({});
    }
    return jsonResponse({});
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("SpriteAnimator model defaults", () => {
  it("keeps per-step model settings separate and hides Seedance 1 from attack 1", async () => {
    render(<SpriteAnimator defaultKeys={{
      assetKey: "asset",
      animationKey: "animation",
      fps: 30,
      targetSize: 512,
      loop: true
    }} onBack={() => undefined} />);

    openMainSettings();
    await waitFor(() => expect(getSettingsButtons()).toHaveLength(8));

    openSettingsGroup(1);
    const walkImageModelSelect = getSelectWithOption(NANO_IMAGE_MODEL);
    fireEvent.change(walkImageModelSelect, {
      target: { value: NANO_IMAGE_MODEL }
    });
    expect(walkImageModelSelect).toHaveValue(NANO_IMAGE_MODEL);

    openSettingsGroup(2);
    expect(getSelectWithOption(NANO_IMAGE_MODEL)).toHaveValue(APIMART_IMAGE_MODEL);

    openSettingsGroup(3);
    expect(getSelectWithOption(NANO_IMAGE_MODEL)).toHaveValue(APIMART_IMAGE_MODEL);
    const runVideoModelSelect = getVideoSelect();
    await waitFor(() => expect(getOptionValues(runVideoModelSelect)).toContain(SEEDANCE_1_MODEL));
    fireEvent.change(runVideoModelSelect, {
      target: { value: SEEDANCE_1_MODEL }
    });
    expect(runVideoModelSelect).toHaveValue(SEEDANCE_1_MODEL);

    openSettingsGroup(4);
    expect(getSelectWithOption(NANO_IMAGE_MODEL)).toHaveValue(APIMART_IMAGE_MODEL);
    const attackVideoModelSelect = getVideoSelect();
    expect(getOptionValues(attackVideoModelSelect)).not.toContain(SEEDANCE_1_MODEL);
    expect(attackVideoModelSelect.value).toContain("seedance-2.0");
  });
});

function openMainSettings() {
  const navItems = Array.from(document.querySelectorAll<HTMLButtonElement>(".side-nav .nav-item"));
  fireEvent.click(navItems[navItems.length - 1]);
}

function openSettingsGroup(index: number) {
  fireEvent.click(getSettingsButtons()[index]);
}

function getSettingsButtons() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".module01-settings-nav .nav-item"));
}

function getSelectWithOption(optionValue: string): HTMLSelectElement {
  const select = (screen.getAllByRole("combobox") as HTMLSelectElement[]).find((item) =>
    getOptionValues(item).includes(optionValue)
  );
  if (!select) {
    throw new Error(`Missing select with option ${optionValue}`);
  }
  return select;
}

function getVideoSelect(): HTMLSelectElement {
  const select = (screen.getAllByRole("combobox") as HTMLSelectElement[]).find((item) =>
    getOptionValues(item).some((value) => value.includes("seedance"))
  );
  if (!select) {
    throw new Error("Missing video model select");
  }
  return select;
}

function getOptionValues(select: HTMLSelectElement): string[] {
  return Array.from(select.options).map((option) => option.value);
}

function makeProviderModelCatalog() {
  const providers = [
    { id: "apimart", label: "APIMart", kind: "openai-images", enabled: true, configured: true },
    { id: "openrouter", label: "OpenRouter", kind: "openrouter", enabled: true, configured: true }
  ];
  const imageModels = [
    {
      id: APIMART_IMAGE_MODEL,
      providerId: "apimart",
      upstreamModel: "gpt-image-2",
      label: "GPT-Image-2",
      capability: "image",
      enabled: true,
      imageSizeOptions: [{ size: 1024, label: "1024 x 1024" }],
      defaultImageSize: 1024
    },
    {
      id: NANO_IMAGE_MODEL,
      providerId: "apimart",
      upstreamModel: "google/gemini-3.1-flash-image-preview",
      label: "Nano Banana 2",
      capability: "image",
      enabled: true,
      imageSizeOptions: [{ size: 1024, label: "1024 x 1024" }],
      defaultImageSize: 1024
    }
  ];
  const videoModels = [
    {
      id: "apimart/seedance-2.0",
      providerId: "apimart",
      upstreamModel: "doubao-seedance-2.0",
      label: "Seedance 2.0",
      capability: "video",
      enabled: true,
      durationOptions: [4, 5, 6],
      defaultDurationSeconds: 4,
      resolutionOptions: ["480p", "720p", "1080p"],
      defaultResolution: "720p"
    },
    {
      id: SEEDANCE_1_MODEL,
      providerId: "apimart",
      upstreamModel: "doubao-seedance-1-0-pro-quality",
      label: "Seedance 1.0 Pro Quality",
      capability: "video",
      enabled: true,
      durationOptions: [2, 3, 4, 5, 6],
      defaultDurationSeconds: 5,
      resolutionOptions: ["480p", "720p", "1080p"],
      defaultResolution: "720p"
    }
  ];
  return {
    providers,
    models: [...imageModels, ...videoModels],
    imageModels,
    videoModels,
    defaults: {
      imageModelId: APIMART_IMAGE_MODEL,
      videoModelId: "apimart/seedance-2.0"
    }
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response;
}
