import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { getRest } from "../../api/client";
import type { Account } from "../../api/types";
import { t } from "../../i18n/pt-BR";
import { DISCOVER_CATEGORIES, discoverAccounts, type DiscoverCategoryId } from "../../lib/discover";
import { htmlToPlainText, shortNumber } from "../../lib/format";
import { currentAccount } from "../../state/store";
import { useCollectionRelationships } from "../collections/useCollectionRelationships";
import { EmojiText } from "../status/EmojiText";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";

export function DiscoverPanel({ onGo }: { onGo: (href: string) => void }): JSX.Element | null {
  const viewer = currentAccount();
  const [activeId, setActiveId] = useState<DiscoverCategoryId>(DISCOVER_CATEGORIES[0].id);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
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
  const category = DISCOVER_CATEGORIES.find((entry) => entry.id === activeId)!;
  const { states, toggle } = useCollectionRelationships(accounts, viewer?.instance ?? "");

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

  return (
    <div class="discover-panel">
      <div class="discover-intro">
        <h2>{t.discoverTopics}</h2>
        <p class="muted">{t.discoverHint}</p>
      </div>
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

      <div class="discover-results">
        <h3 class="sub-section-title">{t.discoverProfiles}</h3>
        {loading ? (
          <div class="center-state">
            <span class="spinner" />
          </div>
        ) : failed ? (
          <div class="center-state">
            <Icon name="wifi-off-line" size={26} />
            <h3>{t.errorLoad}</h3>
            <button type="button" class="btn ghost" onClick={() => setTick((value) => value + 1)}>
              <Icon name="refresh-2-line" size={16} />
              {t.retry}
            </button>
          </div>
        ) : !accounts.length ? (
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
          </div>
        )}
      </div>
    </div>
  );
}
