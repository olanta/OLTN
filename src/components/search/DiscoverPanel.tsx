import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { getRest } from "../../api/client";
import type { Account } from "../../api/types";
import { t } from "../../i18n/pt-BR";
import { DISCOVERY_SEEDS } from "../../lib/discover-seeds";
import {
  DISCOVER_CATEGORIES,
  DISCOVER_LANGUAGES,
  discoverAccounts,
  type DiscoverCategory,
  type DiscoverCategoryId,
} from "../../lib/discover";
import { htmlToPlainText, shortNumber } from "../../lib/format";
import { currentAccount, store } from "../../state/store";
import { useCollectionRelationships } from "../collections/useCollectionRelationships";
import { DiscoverSeedRow } from "./DiscoverSeeds";
import { EmojiText } from "../status/EmojiText";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";

type DiscoverMode = "topics" | "languages";

export function DiscoverPanel({ onGo }: { onGo: (href: string) => void }): JSX.Element | null {
  const viewer = currentAccount();
  const [mode, setMode] = useState<DiscoverMode>("topics");
  const [activeId, setActiveId] = useState<DiscoverCategoryId>(DISCOVER_CATEGORIES[0].id);
  const [activeLanguage, setActiveLanguage] = useState<string>(() =>
    store.settings.language.startsWith("pt") ? "pt" : "en",
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const [seedLimit, setSeedLimit] = useState(80);
  const labels: Record<DiscoverCategoryId, string> = {
    art: t.discoverArt,
    books: t.discoverBooks,
    cinema: t.discoverCinema,
    music: t.discoverMusic,
    tech: t.discoverTech,
    science: t.discoverScience,
    news: t.discoverNews,
    nature: t.discoverNature,
    photography: t.discoverPhotography,
    gaming: t.discoverGaming,
    health: t.discoverHealth,
    travel: t.discoverTravel,
    communities: t.discoverCommunities,
  };
  const category: DiscoverCategory =
    mode === "topics"
      ? DISCOVER_CATEGORIES.find((entry) => entry.id === activeId)!
      : DISCOVER_LANGUAGES.find((entry) => entry.id === activeLanguage)!;
  const { states, toggle } = useCollectionRelationships(accounts, viewer?.instance ?? "");

  useEffect(() => {
    setSeedLimit(80);
  }, [category.id]);

  useEffect(() => {
    const account = currentAccount();
    if (!account) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const client = getRest(account.instance, account.accessToken);
    void discoverAccounts(client, account.instance, category, account.id)
      .then((result) => {
        if (!cancelled) setAccounts(result);
      })
      .catch((err) => {
        console.warn("[oltn] discover failed", err);
        if (!cancelled) {
          setAccounts([]);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, tick, viewer?.id, viewer?.instance]);

  if (!viewer) return null;
  const allSeeds = DISCOVERY_SEEDS[category.id] ?? [];
  const knownHandles = new Set(
    accounts.flatMap((account) => {
      const acct = account.acct.toLowerCase();
      return acct.includes("@") ? [acct] : [acct, `${acct}@${viewer.instance.toLowerCase()}`];
    }),
  );
  const seedHandles = allSeeds.filter((handle) => !knownHandles.has(handle.toLowerCase()));
  const visibleSeeds = seedHandles.slice(0, seedLimit);
  const hasRows = accounts.length > 0 || seedHandles.length > 0;

  return (
    <div class="discover-panel">
      <div class="discover-intro">
        <h2>{t.discoverTopics}</h2>
        <p class="muted">{t.discoverHint}</p>
      </div>
      <div class="segmented discover-mode">
        <button
          type="button"
          class={mode === "topics" ? "active" : ""}
          onClick={() => setMode("topics")}
        >
          {t.discoverTopics}
        </button>
        <button
          type="button"
          class={mode === "languages" ? "active" : ""}
          onClick={() => setMode("languages")}
        >
          {t.discoverLanguages}
        </button>
      </div>

      {mode === "topics" ? (
        <div class="discover-categories">
          {DISCOVER_CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              class={`discover-category ${entry.id === activeId ? "active" : ""}`}
              aria-pressed={entry.id === activeId}
              onClick={() => setActiveId(entry.id)}
            >
              <Icon name={entry.icon} size={16} />
              {labels[entry.id]}
            </button>
          ))}
        </div>
      ) : (
        <div class="discover-language">
          <label for="discover-language">{t.language}</label>
          <select
            id="discover-language"
            class="field"
            value={activeLanguage}
            onChange={(e) => setActiveLanguage((e.target as HTMLSelectElement).value)}
          >
            {DISCOVER_LANGUAGES.map((language) => (
              <option value={language.id}>
                {language.label} — {language.english}
              </option>
            ))}
          </select>
        </div>
      )}

      <div class="discover-results">
        <h3 class="sub-section-title">{t.discoverProfiles}</h3>
        {loading ? (
          <div class="center-state">
            <span class="spinner" />
          </div>
        ) : failed && !seedHandles.length ? (
          <div class="center-state">
            <Icon name="wifi-off-line" size={26} />
            <h3>{t.errorLoad}</h3>
            <button type="button" class="btn ghost" onClick={() => setTick((value) => value + 1)}>
              <Icon name="refresh-2-line" size={16} />
              {t.retry}
            </button>
          </div>
        ) : !hasRows ? (
          <div class="center-state">
            <Icon name="user-3-line" size={26} />
            <h3>{t.discoverEmpty}</h3>
          </div>
        ) : (
          <div class="discover-list">
            {accounts.map((account) => {
              const state = states[account.id];
              const following = state?.relationship?.following || state?.relationship?.requested;
              const self = account.id === viewer.id;
              const bio = htmlToPlainText(account.note).trim();
              return (
                <div class="discover-account" key={account.id}>
                  <button
                    type="button"
                    class="discover-account-main"
                    onClick={() => onGo(`/${encodeURIComponent(viewer.instance)}/a/${account.id}`)}
                  >
                    <Avatar
                      src={account.avatar}
                      name={account.displayName || account.username}
                      size={42}
                    />
                    <span class="row-main">
                      <span class="row-title">
                        <EmojiText
                          text={account.displayName || account.username}
                          emojis={account.emojis}
                        />
                        {account.followersCount > 0 && (
                          <span class="discover-followers">
                            {shortNumber(account.followersCount)} {t.followers}
                          </span>
                        )}
                      </span>
                      <span class="row-sub">@{account.acct}</span>
                      {bio && <span class="discover-bio">{bio}</span>}
                    </span>
                  </button>
                  {!self && (
                    <button
                      type="button"
                      class={`btn sm ${following ? "ghost" : "primary"}`}
                      disabled={!state?.localId || state.busy}
                      onClick={() => void toggle(account.id)}
                    >
                      {state?.busy ? (
                        <span class="spinner" />
                      ) : following ? (
                        state.relationship?.requested ? (
                          t.followRequested
                        ) : (
                          t.unfollow
                        )
                      ) : (
                        t.follow
                      )}
                    </button>
                  )}
                </div>
              );
            })}
            {visibleSeeds.map((handle) => (
              <DiscoverSeedRow
                key={handle}
                handle={handle}
                instance={viewer.instance}
                onGo={onGo}
              />
            ))}
            {seedHandles.length > seedLimit && (
              <button
                type="button"
                class="btn ghost discover-seed-more"
                onClick={() => setSeedLimit((value) => value + 80)}
              >
                {t.showMore} ({seedHandles.length - seedLimit})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
