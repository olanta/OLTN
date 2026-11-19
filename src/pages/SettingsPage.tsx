import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { useSnapshot } from "valtio";
import type { Shortcut, ShortcutType } from "../api/types";
import { t } from "../i18n/pt-BR";
import { readAltTextSettings, writeAltTextSettings, type AltTextSettings } from "../lib/alt-text";
import { navigate } from "../lib/router";
import { normalizeTextSize, TEXT_SIZES } from "../lib/text-size";
import { PushSettings } from "../components/settings/PushSettings";
import { Icon } from "../components/ui/Icon";
import { PageShell } from "../components/ui/PageShell";
import { resetColumnLayout, saveSettings, saveShortcuts, signOut, syncStream } from "../state/boot";
import { store, toast } from "../state/store";

const LANGUAGE_OPTIONS = [
  ["en", "English"],
  ["pt-BR", "Português"],
] as const;

export function SettingsPage(): JSX.Element {
  const snap = useSnapshot(store);
  const settings = snap.settings;
  const shortcuts = snap.shortcuts;
  const [scType, setScType] = useState<ShortcutType>("hashtag");
  const [scValue, setScValue] = useState("");
  const [scLabel, setScLabel] = useState("");
  const [altText, setAltText] = useState<AltTextSettings>(() => readAltTextSettings());

  const themeOptions = [
    ["dark", t.themeDark],
    ["light", t.themeLight],
    ["auto", t.themeAuto],
  ] as const;

  const accentOptions = [
    ["green", t.accentGreen, "#3ddc97"],
    ["orange", t.accentOrange, "#f59e0b"],
    ["purple", t.accentPurple, "#a78bfa"],
    ["blue", t.accentBlue, "#60a5fa"],
    ["pink", t.accentPink, "#f472b6"],
  ] as const;

  const darkTextOptions = [
    ["soft", t.textSoft, "#e7edf3"],
    ["white", t.textWhite, "#ffffff"],
    ["warm", t.textWarm, "#f5ead6"],
    ["cool", t.textCool, "#dbe7ff"],
  ] as const;

  const lightTextOptions = [
    ["charcoal", t.textCharcoal, "#101720"],
    ["black", t.textBlack, "#000000"],
    ["warm", t.textWarm, "#241c15"],
    ["cool", t.textCool, "#101b2b"],
    ["gray", t.textGray, "#39424e"],
  ] as const;

  const layoutOptions = [
    ["columns", t.layoutColumns],
    ["floats", t.layoutFloats],
    ["social", t.layoutSocial],
  ] as const;

  const fontOptions = [
    ["space", t.fontSpaceGrotesk],
    ["atkinson", t.fontAtkinson],
    ["system", t.fontSystem],
    ["serif", t.fontSerif],
    ["mono", t.fontMono],
  ] as const;

  const shortcutTypes: [ShortcutType, string][] = [
    ["home", t.home],
    ["local", t.local],
    ["federated", t.federated],
    ["notifications", t.notifications],
    ["mentions", t.mentions],
    ["direct", t.messages],
    ["list", t.lists],
    ["hashtag", t.hashtag],
    ["bookmarks", t.bookmarks],
    ["favourites", t.favourites],
    ["boosts", t.boosts],
    ["trending", t.trending],
  ];

  const update = (patch: Partial<typeof settings>): void => {
    store.settings = { ...store.settings, ...patch };
    saveSettings();
  };

  const updateAltText = (patch: Partial<AltTextSettings>): void => {
    const next = { ...altText, ...patch };
    setAltText(next);
    writeAltTextSettings(next);
  };

  const resetLayout = (): void => {
    resetColumnLayout();
    toast(t.layoutReset, "ok");
  };

  const copyVersion = async (): Promise<void> => {
    const build = __APP_INFO__.commit ? ` (${__APP_INFO__.commit})` : "";
    const text = `OLTN v${__APP_INFO__.version}${build}`;
    try {
      await navigator.clipboard.writeText(text);
      toast(t.versionCopied, "ok");
    } catch {
      toast(text);
    }
  };

  const addShortcut = (e: Event): void => {
    e.preventDefault();
    const needsValue = scType === "list" || scType === "hashtag";
    if (needsValue && !scValue.trim()) return;
    const shortcut: Shortcut = {
      id: `${scType}:${scValue.trim() || scType}`,
      type: scType,
      label: scLabel.trim() || shortcutTypes.find(([k]) => k === scType)?.[1] || scType,
      value: needsValue ? scValue.trim() : undefined,
    };
    if (shortcuts.some((s) => s.id === shortcut.id)) return;
    saveShortcuts([...shortcuts, shortcut]);
    setScValue("");
    setScLabel("");
  };

  return (
    <PageShell title={t.settings} showBack>
      <div class="settings">
        <section class="settings-section">
          <h1 class="section-title">{t.appearance}</h1>
          <div class="setting-row">
            <span>{t.theme}</span>
            <div class="segmented">
              {themeOptions.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  class={`seg ${settings.theme === value ? "active" : ""}`}
                  onClick={() => update({ theme: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div class="setting-row">
            <span>{t.language}</span>
            <div class="segmented">
              {LANGUAGE_OPTIONS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  class={`seg ${settings.language === value ? "active" : ""}`}
                  onClick={() => update({ language: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div class="setting-row">
            <span>{t.accent}</span>
            <div class="accent-swatches">
              {accentOptions.map(([value, label, color]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={settings.accent === value}
                  aria-label={label}
                  title={label}
                  class={`accent-swatch ${settings.accent === value ? "active" : ""}`}
                  style={`--swatch:${color}`}
                  onClick={() => update({ accent: value })}
                />
              ))}
            </div>
          </div>
          <div class="setting-row">
            <span>{t.layoutMode}</span>
            <div class="segmented">
              {layoutOptions.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  class={`seg ${settings.layout === value ? "active" : ""}`}
                  onClick={() => update({ layout: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p class="muted">{t.layoutModeHint}</p>
          {settings.layout !== "social" && <p class="muted">{t.layoutHint}</p>}
          <div class="btn-row">
            <button type="button" class="btn ghost" onClick={resetLayout}>
              <Icon name="refresh-2-line" size={16} />
              {t.resetLayout}
            </button>
          </div>
        </section>

        <section class="settings-section">
          <h1 class="section-title">{t.accessibility}</h1>
          <div class="setting-row">
            <span>{t.textSize}</span>
            <select
              class="field font-select"
              value={String(settings.textSize)}
              onChange={(e) =>
                update({
                  textSize: normalizeTextSize(Number((e.target as HTMLSelectElement).value)),
                })
              }
            >
              {TEXT_SIZES.map((size) => (
                <option value={size}>{size} px</option>
              ))}
            </select>
          </div>
          <div class="setting-row">
            <span>{t.fontFamily}</span>
            <select
              class="field font-select"
              value={settings.fontFamily}
              onChange={(e) =>
                update({
                  fontFamily: (e.target as HTMLSelectElement).value as typeof settings.fontFamily,
                })
              }
            >
              {fontOptions.map(([value, label]) => (
                <option value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div class="setting-row text-color-row text-color-row--dark">
            <span>{t.textColorDark}</span>
            <div class="accent-swatches">
              {darkTextOptions.map(([value, label, color]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={settings.textColorDark === value}
                  aria-label={label}
                  title={label}
                  class={`accent-swatch ${settings.textColorDark === value ? "active" : ""}`}
                  style={`--swatch:${color}`}
                  onClick={() => update({ textColorDark: value })}
                />
              ))}
            </div>
          </div>
          <div class="setting-row text-color-row text-color-row--light">
            <span>{t.textColorLight}</span>
            <div class="accent-swatches">
              {lightTextOptions.map(([value, label, color]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={settings.textColorLight === value}
                  aria-label={label}
                  title={label}
                  class={`accent-swatch ${settings.textColorLight === value ? "active" : ""}`}
                  style={`--swatch:${color}`}
                  onClick={() => update({ textColorLight: value })}
                />
              ))}
            </div>
          </div>
          <h3 class="sub-section-title">{t.altTextAi}</h3>
          <p class="muted">{t.altTextAiHint}</p>
          <div class="alt-text-field">
            <label htmlFor="alt-text-gemini-key">{t.altTextApiKey}</label>
            <input
              id="alt-text-gemini-key"
              type="password"
              class="field"
              autocomplete="off"
              value={altText.geminiKey}
              onInput={(e) => updateAltText({ geminiKey: (e.target as HTMLInputElement).value })}
            />
          </div>
          <div class="alt-text-field">
            <label htmlFor="alt-text-gemini-model">{t.altTextModel}</label>
            <input
              id="alt-text-gemini-model"
              class="field"
              value={altText.geminiModel}
              onInput={(e) => updateAltText({ geminiModel: (e.target as HTMLInputElement).value })}
            />
          </div>
          <div class="alt-text-tutorial">
            <p>{t.altTextGeminiTutorial}</p>
            <a
              class="alt-text-key-link"
              href="https://aistudio.google.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="external-link-line" size={14} />
              {t.altTextGeminiTutorialLink}
            </a>
          </div>
        </section>

        <section class="settings-section">
          <h1 class="section-title">{t.connection}</h1>
          <div class="setting-row">
            <span>{t.autoStream}</span>
            <input
              type="checkbox"
              class="switch"
              role="switch"
              checked={settings.autoStream}
              aria-label={t.autoStream}
              onChange={(e) => {
                update({ autoStream: (e.target as HTMLInputElement).checked });
                syncStream();
              }}
            />
          </div>
          <p class="muted">{t.autoStreamHint}</p>
        </section>

        <PushSettings />

        <section class="settings-section">
          <h1 class="section-title">{t.media}</h1>
          <div class="setting-row">
            <span>{t.autoplayGifs}</span>
            <input
              type="checkbox"
              class="switch"
              role="switch"
              checked={settings.autoplayGifs}
              aria-label={t.autoplayGifs}
              onChange={(e) => {
                update({ autoplayGifs: (e.target as HTMLInputElement).checked });
              }}
            />
          </div>
          <p class="muted">{t.autoplayGifsHint}</p>
        </section>

        <section class="settings-section">
          <h1 class="section-title">{t.shortcuts}</h1>
          <p class="muted">{t.shortcutsHint}</p>
          <div class="shortcut-list">
            {shortcuts.map((shortcut) => (
              <div class="shortcut-chip" key={shortcut.id}>
                <Icon name="pin-line" size={14} />
                <span>
                  {shortcut.value ? `${shortcut.label} (${shortcut.value})` : shortcut.label}
                </span>
                <button
                  type="button"
                  class="icon-btn"
                  aria-label={t.removeShortcut}
                  onClick={() => saveShortcuts(shortcuts.filter((s) => s.id !== shortcut.id))}
                >
                  <Icon name="close-line" size={14} />
                </button>
              </div>
            ))}
          </div>
          <form class="shortcut-add" onSubmit={addShortcut}>
            <select
              class="field"
              value={scType}
              onChange={(e) => setScType((e.target as HTMLSelectElement).value as ShortcutType)}
            >
              {shortcutTypes.map(([value, label]) => (
                <option value={value}>{label}</option>
              ))}
            </select>
            {(scType === "list" || scType === "hashtag") && (
              <input
                class="field"
                placeholder={scType === "list" ? t.listIdPlaceholder : "tag"}
                value={scValue}
                onInput={(e) => setScValue((e.target as HTMLInputElement).value)}
              />
            )}
            <input
              class="field"
              placeholder={t.shortcutLabelPlaceholder}
              value={scLabel}
              onInput={(e) => setScLabel((e.target as HTMLInputElement).value)}
            />
            <button type="submit" class="btn primary">
              <Icon name="plus-line" size={16} />
              {t.addShortcut}
            </button>
          </form>
        </section>

        <section class="settings-section">
          <h1 class="section-title">{t.keyboard}</h1>
          <p class="muted">{t.keyboardHint}</p>
          <button type="button" class="btn ghost" onClick={() => (store.ui.shortcutsHelp = true)}>
            <Icon name="keyboard-line" size={16} />
            {t.shortcutsHelp}
          </button>
        </section>

        <section class="settings-section">
          <h1 class="section-title">{t.accounts}</h1>
          <button type="button" class="btn ghost" onClick={() => navigate("/accounts")}>
            <Icon name="switch-line" size={16} />
            {t.accounts}
          </button>
          <button
            type="button"
            class="btn ghost danger"
            onClick={() => {
              if (confirm(t.logoutConfirm)) {
                void signOut();
              }
            }}
          >
            <Icon name="exit-line" size={16} />
            {t.logout}
          </button>
        </section>

        <section class="settings-section">
          <h1 class="section-title">{t.about}</h1>
          <p class="muted">{t.aboutText}</p>
          <dl class="version-info">
            <div>
              <dt>{t.version}</dt>
              <dd>v{__APP_INFO__.version}</dd>
            </div>
            {__APP_INFO__.commit && (
              <div>
                <dt>{t.build}</dt>
                <dd>
                  <code>{__APP_INFO__.commit}</code>
                </dd>
              </div>
            )}
            <div>
              <dt>{t.builtOn}</dt>
              <dd>{__APP_INFO__.date.slice(0, 10)}</dd>
            </div>
          </dl>
          <div class="btn-row">
            <button type="button" class="btn ghost" onClick={() => void copyVersion()}>
              <Icon name="copy-line" size={16} />
              {t.copyVersion}
            </button>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
