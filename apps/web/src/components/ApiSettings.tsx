import { ArrowLeft, KeyRound, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { APIMART_PROVIDER_ID, OPENROUTER_PROVIDER_ID, type ProviderModelCatalog } from "@ai-game-workbench/core";
import {
  getProviderModelCatalog,
  loadUserApiProviderSettings,
  saveUserApiProviderSettings,
  SELECTABLE_API_PROVIDER_IDS,
  USER_API_PROVIDER_SETTINGS_UPDATED_EVENT,
  USER_API_PROVIDER_SETTINGS_STORAGE_KEY
} from "../api/client";

interface ApiSettingsProps {
  onBack: () => void;
}

export function ApiSettings({ onBack }: ApiSettingsProps) {
  const [settings, setSettings] = useState(() => loadUserApiProviderSettings());
  const [catalog, setCatalog] = useState<ProviderModelCatalog | null>(null);
  const [status, setStatus] = useState("选择一个服务商，填入这个服务商的 API key 后保存。");

  useEffect(() => {
    let cancelled = false;
    void getProviderModelCatalog()
      .then((nextCatalog) => {
        if (!cancelled) {
          setCatalog(nextCatalog);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus(`模型列表加载失败：${getErrorMessage(error)}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectableProviders = useMemo(
    () => (catalog?.providers ?? [])
      .filter((provider) => SELECTABLE_API_PROVIDER_IDS.includes(provider.id as typeof SELECTABLE_API_PROVIDER_IDS[number]) || provider.id === "openrouter-compatible"),
    [catalog]
  );
  const activeKey = settings.apiKeys[settings.providerId] ?? "";
  const activeProvider = selectableProviders.find((provider) => provider.id === settings.providerId)
    ?? (settings.providerId === APIMART_PROVIDER_ID ? selectableProviders.find((provider) => provider.id === "openrouter-compatible") : undefined);
  const activeModels = useMemo(
    () => catalog?.models.filter((model) => model.enabled && (model.providerId === settings.providerId || settings.providerId === APIMART_PROVIDER_ID && model.providerId === "openrouter-compatible")) ?? [],
    [catalog, settings.providerId]
  );

  const updateProvider = (providerId: string) => {
    setSettings((current) => ({
      ...current,
      providerId
    }));
  };

  const updateApiKey = (providerId: string, apiKey: string) => {
    setSettings((current) => ({
      ...current,
      apiKeys: {
        ...current.apiKeys,
        [providerId]: apiKey
      }
    }));
  };

  const saveSettings = () => {
    saveUserApiProviderSettings(settings);
    window.dispatchEvent(new Event(USER_API_PROVIDER_SETTINGS_UPDATED_EVENT));
    window.dispatchEvent(new StorageEvent("storage", { key: USER_API_PROVIDER_SETTINGS_STORAGE_KEY }));
    setStatus(`${activeProvider?.label ?? settings.providerId} 已保存。`);
  };

  return (
    <main className="app-shell settings-shell">
      <header className="settings-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Back to workbench">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="eyebrow">API</p>
          <h1>API 设置</h1>
        </div>
      </header>

      <section className="settings-layout">
        <section className="settings-section">
          <h2>服务商</h2>
          <div className="settings-table">
            {selectableProviders.map((provider) => {
              const isSelected = provider.id === settings.providerId;
              return (
                <label className="settings-row settings-provider-choice" key={provider.id}>
                  <span className="settings-check">
                    <input
                      type="radio"
                      name="api-provider"
                      checked={isSelected || settings.providerId === APIMART_PROVIDER_ID && provider.id === "openrouter-compatible"}
                      onChange={() => updateProvider(provider.id === "openrouter-compatible" ? APIMART_PROVIDER_ID : provider.id)}
                    />
                    {provider.label}
                  </span>
                  <span className="settings-provider-base-url">{provider.baseUrl}</span>
                  <span className="settings-provider-models">
                    {(catalog?.models ?? []).filter((model) => model.enabled && model.providerId === provider.id).map((model) => model.label).join(" / ")}
                  </span>
                </label>
              );
            })}
            {selectableProviders.length === 0 ? <p className="settings-status">没有可用服务商。</p> : null}
          </div>
        </section>

        <section className="settings-section">
          <h2>API Key</h2>
          <label className="field">
            {activeProvider?.label ?? "当前服务商"} API key
            <input
              aria-label={`${activeProvider?.label ?? settings.providerId} API key`}
              autoComplete="off"
              type="password"
              value={activeKey}
              onChange={(event) => updateApiKey(settings.providerId, event.target.value)}
            />
          </label>
          <div className="settings-actions">
            <button className="tool-button primary" type="button" onClick={saveSettings}>
              <Save size={16} /> 保存
            </button>
            <button className="tool-button" type="button" onClick={() => updateApiKey(settings.providerId, "")}>
              <KeyRound size={16} /> 清空当前 key
            </button>
          </div>
          <p className="settings-status">{status}</p>
        </section>

        <section className="settings-section">
          <h2>当前可选模型</h2>
          <div className="settings-model-list">
            {activeModels.map((model) => (
              <div className="settings-model-item" key={model.id}>
                <span>{model.label}</span>
                <span>{model.capability === "image" ? "图片" : "视频"}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
