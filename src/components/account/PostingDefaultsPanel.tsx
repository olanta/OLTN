import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { getRest } from "../../api/client";
import type { ComposeVisibility } from "../../api/types";
import { t } from "../../i18n/pt-BR";
import { userMessageForError } from "../../lib/errors";
import { defaultComposeVisibility, normalizeQuotePolicy } from "../compose/compose-context";
import type { QuotePolicy } from "../../lib/publish-plan";
import { currentAccount, store, toast } from "../../state/store";

export function PostingDefaultsPanel(): JSX.Element {
  const [visibility, setVisibility] = useState<ComposeVisibility>("public");
  const [sensitive, setSensitive] = useState(false);
  const [quotePolicy, setQuotePolicy] = useState<QuotePolicy>("public");
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
        setVisibility(defaultComposeVisibility(me.source.privacy));
        setSensitive(!!me.source.sensitive);
        setQuotePolicy(normalizeQuotePolicy(me.source.quotePolicy));
      })
      .catch((err) => {
        console.warn("[oltn] posting defaults load failed", err);
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const quoteDisabled = visibility === "private" || visibility === "direct";
  const effectiveQuotePolicy: QuotePolicy = quoteDisabled ? "nobody" : quotePolicy;

  const save = async (): Promise<void> => {
    const account = currentAccount();
    if (!account || saving) return;
    setSaving(true);
    try {
      const client = getRest(account.instance, account.accessToken);
      const me = await client.v1.accounts.updateCredentials({
        source: {
          privacy: visibility,
          sensitive,
          quote_policy: effectiveQuotePolicy,
        },
      } as Parameters<typeof client.v1.accounts.updateCredentials>[0]);
      store.me = me;
      toast(t.saved, "ok");
    } catch (err) {
      console.warn("[oltn] posting defaults save failed", err);
      toast(userMessageForError(err, t.errorGeneric), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section class="account-panel">
      <div>
        <h2>{t.postingDefaults}</h2>
        <p class="muted">{t.postingDefaultsHint}</p>
      </div>
      {loading ? (
        <div class="center-state">
          <span class="spinner" />
        </div>
      ) : failed ? (
        <div class="center-state">
          <h3>{t.errorLoad}</h3>
        </div>
      ) : (
        <>
          <label class="account-field-row" for="posting-default-visibility">
            <span>{t.defaultVisibility}</span>
            <select
              id="posting-default-visibility"
              class="field"
              value={visibility}
              onChange={(e) =>
                setVisibility((e.target as HTMLSelectElement).value as ComposeVisibility)
              }
            >
              <option value="public">{t.visPublic}</option>
              <option value="unlisted">{t.visUnlisted}</option>
              <option value="private">{t.visPrivate}</option>
              <option value="direct">{t.visDirect}</option>
            </select>
          </label>
          <div class="setting-row account-setting">
            <div>
              <strong>{t.defaultSensitive}</strong>
              <p class="muted">{t.defaultSensitiveHint}</p>
            </div>
            <input
              type="checkbox"
              class="switch"
              role="switch"
              checked={sensitive}
              onChange={(e) => setSensitive((e.target as HTMLInputElement).checked)}
            />
          </div>
          <label class="account-field-row" for="posting-default-quote">
            <span>{t.defaultQuotePolicy}</span>
            <select
              id="posting-default-quote"
              class="field"
              value={effectiveQuotePolicy}
              disabled={quoteDisabled}
              onChange={(e) => setQuotePolicy((e.target as HTMLSelectElement).value as QuotePolicy)}
            >
              <option value="public">{t.quotePolicyPublic}</option>
              <option value="followers">{t.quotePolicyFollowers}</option>
              <option value="nobody">{t.quotePolicyNobody}</option>
            </select>
            <small class="muted">{t.defaultQuotePolicyHint}</small>
          </label>
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
