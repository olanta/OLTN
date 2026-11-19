import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { getRest } from "../../api/client";
import type { Account } from "../../api/types";
import { t } from "../../i18n/pt-BR";
import { userMessageForError } from "../../lib/errors";
import { hrefFor } from "../../lib/identity";
import { navigate } from "../../lib/router";
import { currentAccount, toast } from "../../state/store";
import { EmojiText } from "../status/EmojiText";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";

type Kind = "mutes" | "blocks";

const COPY: Record<
  Kind,
  { title: () => string; hint: () => string; empty: () => string; action: () => string }
> = {
  mutes: {
    title: () => t.mutedUsers,
    hint: () => t.mutedUsersHint,
    empty: () => t.emptyMutedUsers,
    action: () => t.unmute,
  },
  blocks: {
    title: () => t.blockedUsers,
    hint: () => t.blockedUsersHint,
    empty: () => t.emptyBlockedUsers,
    action: () => t.unblock,
  },
};

export function RelationshipAccountsPanel({ kind }: { kind: Kind }): JSX.Element {
  const [items, setItems] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const copy = COPY[kind];

  useEffect(() => {
    const account = currentAccount();
    if (!account) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const client = getRest(account.instance, account.accessToken);
    void (async () => {
      try {
        const result =
          kind === "mutes"
            ? await client.v1.mutes.list({ limit: 80 })
            : await client.v1.blocks.list({ limit: 80 });
        if (!cancelled) setItems(result);
      } catch (err) {
        console.warn(`[oltn] ${kind} load failed`, err);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const remove = async (account: Account): Promise<void> => {
    const viewer = currentAccount();
    if (!viewer || busy) return;
    setBusy(account.id);
    try {
      const client = getRest(viewer.instance, viewer.accessToken);
      const selected = client.v1.accounts.$select(account.id);
      if (kind === "mutes") await selected.unmute();
      else await selected.unblock();
      setItems((current) => current.filter((entry) => entry.id !== account.id));
      toast(kind === "mutes" ? t.unmuted : t.unblocked, "ok");
    } catch (err) {
      console.warn(`[oltn] ${kind} remove failed`, err);
      toast(userMessageForError(err, t.errorGeneric), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section class="account-panel">
      <div>
        <h2>{copy.title()}</h2>
        <p class="muted">{copy.hint()}</p>
      </div>
      {loading ? (
        <div class="center-state">
          <span class="spinner" />
        </div>
      ) : failed ? (
        <div class="center-state">
          <Icon name="wifi-off-line" size={26} />
          <h3>{t.errorLoad}</h3>
        </div>
      ) : !items.length ? (
        <div class="center-state">
          <Icon name={kind === "mutes" ? "volume-line" : "user-forbid-line"} size={26} />
          <h3>{copy.empty()}</h3>
        </div>
      ) : (
        <div class="account-list">
          {items.map((account) => {
            const href = hrefFor.accountById(currentAccount()?.instance ?? "", account.id);
            return (
              <div class="list-row" key={account.id}>
                <button type="button" class="list-row-main" onClick={() => navigate(href)}>
                  <Avatar
                    src={account.avatar}
                    name={account.displayName || account.username}
                    size={38}
                  />
                  <span class="row-main">
                    <span class="row-title">
                      <EmojiText
                        text={account.displayName || account.username}
                        emojis={account.emojis}
                      />
                    </span>
                    <span class="row-sub">@{account.acct}</span>
                  </span>
                </button>
                <button
                  type="button"
                  class="btn sm ghost"
                  disabled={busy === account.id}
                  onClick={() => void remove(account)}
                >
                  {busy === account.id ? <span class="spinner" /> : copy.action()}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
