import type { JSX } from "preact";
import { useSnapshot } from "valtio";
import type { CleanupPolicy } from "../../api/types";
import { t } from "../../i18n/pt-BR";
import {
  CLEANUP_MIN_AGE_SECONDS,
  DEFAULT_CLEANUP_POLICY,
  normalizeCleanupPolicy,
} from "../../lib/cleanup";
import { saveCleanupPolicy } from "../../state/boot";
import { accountNS, currentAccount, store } from "../../state/store";

export function CleanupSettings(): JSX.Element | null {
  const snap = useSnapshot(store);
  const account = currentAccount();
  if (!account) return null;
  const cleanup = normalizeCleanupPolicy(
    snap.prefs[accountNS(account)]?.cleanup ?? DEFAULT_CLEANUP_POLICY,
  );
  const ageOptions = [
    { value: CLEANUP_MIN_AGE_SECONDS[0], label: t.cleanupAge1Week },
    { value: CLEANUP_MIN_AGE_SECONDS[1], label: t.cleanupAge2Weeks },
    { value: CLEANUP_MIN_AGE_SECONDS[2], label: t.cleanupAge1Month },
    { value: CLEANUP_MIN_AGE_SECONDS[3], label: t.cleanupAge2Months },
    { value: CLEANUP_MIN_AGE_SECONDS[4], label: t.cleanupAge3Months },
    { value: CLEANUP_MIN_AGE_SECONDS[5], label: t.cleanupAge6Months },
    { value: CLEANUP_MIN_AGE_SECONDS[6], label: t.cleanupAge1Year },
    { value: CLEANUP_MIN_AGE_SECONDS[7], label: t.cleanupAge2Years },
  ];
  const exceptions: { key: keyof CleanupPolicy; label: string; hint: string }[] = [
    { key: "keepPinned", label: t.cleanupKeepPinned, hint: t.cleanupKeepPinnedHint },
    { key: "keepDirect", label: t.cleanupKeepDirect, hint: t.cleanupKeepDirectHint },
    { key: "keepFavourited", label: t.cleanupKeepFavourited, hint: t.cleanupKeepFavouritedHint },
    { key: "keepBookmarked", label: t.cleanupKeepBookmarked, hint: t.cleanupKeepBookmarkedHint },
    { key: "keepPolls", label: t.cleanupKeepPolls, hint: t.cleanupKeepPollsHint },
    { key: "keepMedia", label: t.cleanupKeepMedia, hint: t.cleanupKeepMediaHint },
  ];

  const update = (patch: Partial<CleanupPolicy>): void => {
    saveCleanupPolicy({ ...cleanup, ...patch });
  };

  return (
    <section class="settings-section">
      <h1 class="section-title">{t.cleanupTitle}</h1>
      <div class="setting-row">
        <span>{t.cleanupEnable}</span>
        <input
          type="checkbox"
          class="switch"
          role="switch"
          checked={cleanup.enabled}
          aria-label={t.cleanupEnable}
          onChange={(e) => {
            update({ enabled: (e.target as HTMLInputElement).checked });
          }}
        />
      </div>
      <p class="muted">{t.cleanupEnableHint}</p>
      <div class="setting-row">
        <span>{t.cleanupAge}</span>
        <select
          class="field cleanup-age-select"
          value={cleanup.minStatusAge}
          disabled={!cleanup.enabled}
          aria-label={t.cleanupAge}
          onChange={(e) => {
            update({ minStatusAge: Number((e.target as HTMLSelectElement).value) });
          }}
        >
          {ageOptions.map(({ value, label }) => (
            <option value={value}>{label}</option>
          ))}
        </select>
      </div>
      <p class="muted">{t.cleanupAgeHint}</p>
      <h3 class="sub-section-title">{t.cleanupExceptions}</h3>
      <div class="cleanup-grid">
        {exceptions.map(({ key, label, hint }) => (
          <label class="cleanup-check" key={key}>
            <input
              type="checkbox"
              checked={cleanup[key] === true}
              disabled={!cleanup.enabled}
              onChange={(e) => {
                update({
                  [key]: (e.target as HTMLInputElement).checked,
                } as Partial<CleanupPolicy>);
              }}
            />
            <span>
              <strong>{label}</strong>
              <small>{hint}</small>
            </span>
          </label>
        ))}
      </div>
      <h3 class="sub-section-title">{t.cleanupInteractions}</h3>
      <div class="cleanup-grid">
        <label class="cleanup-field">
          <span>{t.cleanupMinFavourites}</span>
          <input
            type="number"
            class="field"
            min={1}
            disabled={!cleanup.enabled}
            value={cleanup.minFavourites || ""}
            placeholder={t.cleanupIgnore}
            onInput={(e) => {
              update({ minFavourites: Number((e.target as HTMLInputElement).value) });
            }}
          />
          <small>{t.cleanupMinFavouritesHint}</small>
        </label>
        <label class="cleanup-field">
          <span>{t.cleanupMinBoosts}</span>
          <input
            type="number"
            class="field"
            min={1}
            disabled={!cleanup.enabled}
            value={cleanup.minBoosts || ""}
            placeholder={t.cleanupIgnore}
            onInput={(e) => {
              update({ minBoosts: Number((e.target as HTMLInputElement).value) });
            }}
          />
          <small>{t.cleanupMinBoostsHint}</small>
        </label>
      </div>
      <p class="muted">{t.cleanupInteractionNote}</p>
      <p class="muted">{t.cleanupNote}</p>
    </section>
  );
}
