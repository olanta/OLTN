import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { getRest } from "../../api/client";
import type { UpdateCredentialsParams } from "../../api/types";
import { t } from "../../i18n/pt-BR";
import { userMessageForError } from "../../lib/errors";
import { currentAccount, store, toast } from "../../state/store";

interface PrivacyState {
  discoverable: boolean;
  locked: boolean;
  indexable: boolean;
  showCollections: boolean;
}

type CredentialsWithIndexable = UpdateCredentialsParams & { indexable?: boolean };

export function PrivacyPanel(): JSX.Element {
  const [state, setState] = useState<PrivacyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const account = currentAccount();
    if (!account) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const client = getRest(account.instance, account.accessToken);
    void client.v1.accounts
      .verifyCredentials()
      .then((me) => {
        if (cancelled) return;
        setState({
          discoverable: me.discoverable ?? false,
          locked: me.locked,
          indexable: me.source.indexable !== false,
          showCollections: !me.source.hideCollections,
        });
      })
      .catch((err) => {
        console.warn("[oltn] privacy load failed", err);
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (patch: Partial<PrivacyState>): void => {
    setState((current) => (current ? { ...current, ...patch } : current));
  };

  const save = async (): Promise<void> => {
    const account = currentAccount();
    if (!account || !state || saving) return;
    setSaving(true);
    try {
      const client = getRest(account.instance, account.accessToken);
      const params: CredentialsWithIndexable = {
        discoverable: state.discoverable,
        locked: state.locked,
        indexable: state.indexable,
        hideCollections: !state.showCollections,
      };
      const me = await client.v1.accounts.updateCredentials(params);
      store.me = me;
      toast(t.saved, "ok");
    } catch (err) {
      console.warn("[oltn] privacy save failed", err);
      toast(userMessageForError(err, t.errorGeneric), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section class="account-panel">
      <div>
        <h2>{t.privacyReach}</h2>
        <p class="muted">{t.privacyReachHint}</p>
      </div>
      {loading ? (
        <div class="center-state">
          <span class="spinner" />
        </div>
      ) : failed || !state ? (
        <div class="center-state">
          <h3>{t.errorLoad}</h3>
        </div>
      ) : (
        <>
          <div class="setting-row account-setting">
            <div>
              <strong>{t.discoverable}</strong>
              <p class="muted">{t.discoverableHint}</p>
            </div>
            <input
              type="checkbox"
              class="switch"
              role="switch"
              checked={state.discoverable}
              onChange={(e) => update({ discoverable: (e.target as HTMLInputElement).checked })}
            />
          </div>
          <div class="setting-row account-setting">
            <div>
              <strong>{t.lockedAccount}</strong>
              <p class="muted">{t.lockedAccountHint}</p>
            </div>
            <input
              type="checkbox"
              class="switch"
              role="switch"
              checked={state.locked}
              onChange={(e) => update({ locked: (e.target as HTMLInputElement).checked })}
            />
          </div>
          <div class="setting-row account-setting">
            <div>
              <strong>{t.indexable}</strong>
              <p class="muted">{t.indexableHint}</p>
            </div>
            <input
              type="checkbox"
              class="switch"
              role="switch"
              checked={state.indexable}
              onChange={(e) => update({ indexable: (e.target as HTMLInputElement).checked })}
            />
          </div>
          <div class="setting-row account-setting">
            <div>
              <strong>{t.showCollections}</strong>
              <p class="muted">{t.showCollectionsHint}</p>
            </div>
            <input
              type="checkbox"
              class="switch"
              role="switch"
              checked={state.showCollections}
              onChange={(e) => update({ showCollections: (e.target as HTMLInputElement).checked })}
            />
          </div>
          <div class="btn-row">
            <button type="button" class="btn primary" disabled={saving} onClick={() => void save()}>
              {saving ? <span class="spinner" /> : null}
              {t.save}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
