import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { Account, Relationship } from "../../api/types";
import { t } from "../../i18n/pt-BR";
import { userMessageForError } from "../../lib/errors";
import { clientFor, hrefFor, resolveAccountHandle } from "../../lib/identity";
import { resolveSeedAccount } from "../../lib/seed-accounts";
import { currentAccount, toast } from "../../state/store";
import { Avatar } from "../ui/Avatar";
import { EmojiText } from "../status/EmojiText";

export function DiscoverSeedRow({
  handle,
  instance,
  onGo,
}: {
  handle: string;
  instance: string;
  onGo: (href: string) => void;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const viewer = currentAccount();
  const username = handle.split("@")[0];
  const name = account?.displayName || username;
  const acct = account?.acct || handle;
  const following = relationship?.following || relationship?.requested;

  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    void resolveSeedAccount(clientFor(viewer.instance).client, viewer.instance, handle).then(
      (resolved) => {
        if (!cancelled && resolved) setAccount(resolved);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [handle, viewer?.instance]);

  const toggle = async (): Promise<void> => {
    const viewer = currentAccount();
    if (!viewer || busy) return;
    setBusy(true);
    try {
      const client = clientFor(viewer.instance).client;
      let target = account;
      if (!target) {
        target = await resolveAccountHandle(client, handle);
        if (!target) throw new Error("account_not_found");
        setAccount(target);
      }
      const selected = client.v1.accounts.$select(target.id);
      if (following) {
        setRelationship(await selected.unfollow());
        return;
      }
      if (!relationship) {
        const relationships = await client.v1.accounts.relationships.fetch({ id: [target.id] });
        const current = relationships[0] ?? null;
        setRelationship(current);
        if (current?.following || current?.requested) return;
      }
      setRelationship(await selected.follow());
    } catch (err) {
      console.warn("[oltn] seed follow failed", err);
      toast(userMessageForError(err, t.errorGeneric), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="discover-seed">
      <button
        type="button"
        class="discover-seed-main"
        onClick={() => onGo(hrefFor.account(handle, instance))}
      >
        <Avatar src={account?.avatar} name={name} size={42} />
        <span class="row-main">
          <span class="row-title">
            {account ? <EmojiText text={name} emojis={account.emojis} /> : username}
          </span>
          <span class="row-sub">@{acct}</span>
        </span>
      </button>
      <button
        type="button"
        class={`btn sm ${following ? "ghost" : "primary"}`}
        disabled={busy}
        onClick={() => void toggle()}
      >
        {busy ? (
          <span class="spinner" />
        ) : following ? (
          relationship?.requested ? (
            t.followRequested
          ) : (
            t.unfollow
          )
        ) : (
          t.follow
        )}
      </button>
    </div>
  );
}
