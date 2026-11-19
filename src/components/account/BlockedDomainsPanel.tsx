import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { getRest } from "../../api/client";
import { t } from "../../i18n/pt-BR";
import { userMessageForError } from "../../lib/errors";
import { currentAccount, toast } from "../../state/store";
import { Icon } from "../ui/Icon";

function cleanDomain(value: string): string | null {
  const domain = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null;
}

export function BlockedDomainsPanel(): JSX.Element {
  const [domains, setDomains] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = async (): Promise<void> => {
    const account = currentAccount();
    if (!account) return;
    const client = getRest(account.instance, account.accessToken);
    setDomains(await client.v1.domainBlocks.list({ limit: 80 }));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void load()
      .catch((err) => {
        console.warn("[oltn] domain blocks load failed", err);
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const add = async (e: Event): Promise<void> => {
    e.preventDefault();
    const domain = cleanDomain(input);
    const account = currentAccount();
    if (!domain || !account) {
      if (input.trim()) toast(t.domainInvalid, "error");
      return;
    }
    setBusy(domain);
    try {
      const client = getRest(account.instance, account.accessToken);
      await client.v1.domainBlocks.create({ domain });
      setInput("");
      await load();
      toast(t.domainBlocked, "ok");
    } catch (err) {
      console.warn("[oltn] domain block create failed", err);
      toast(userMessageForError(err, t.errorGeneric), "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (domain: string): Promise<void> => {
    const account = currentAccount();
    if (!account || busy) return;
    setBusy(domain);
    try {
      const client = getRest(account.instance, account.accessToken);
      await client.v1.domainBlocks.remove({ domain });
      setDomains((current) => current.filter((entry) => entry !== domain));
      toast(t.domainUnblocked, "ok");
    } catch (err) {
      console.warn("[oltn] domain block remove failed", err);
      toast(userMessageForError(err, t.errorGeneric), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section class="account-panel">
      <div>
        <h2>{t.blockedDomains}</h2>
        <p class="muted">{t.blockedDomainsHint}</p>
      </div>
      <form class="account-inline-form" onSubmit={(e) => void add(e)}>
        <input
          class="field"
          placeholder={t.domainPlaceholder}
          value={input}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
        />
        <button type="submit" class="btn primary" disabled={!input.trim() || !!busy}>
          <Icon name="plus-line" size={16} />
          {t.blockDomain}
        </button>
      </form>
      {loading ? (
        <div class="center-state">
          <span class="spinner" />
        </div>
      ) : failed ? (
        <div class="center-state">
          <Icon name="wifi-off-line" size={26} />
          <h3>{t.errorLoad}</h3>
        </div>
      ) : !domains.length ? (
        <div class="center-state">
          <Icon name="globe-line" size={26} />
          <h3>{t.emptyBlockedDomains}</h3>
        </div>
      ) : (
        <div class="account-list">
          {domains.map((domain) => (
            <div class="list-row" key={domain}>
              <Icon name="globe-line" size={18} />
              <div class="row-main">
                <div class="row-title">{domain}</div>
              </div>
              <button
                type="button"
                class="btn sm ghost"
                disabled={busy === domain}
                onClick={() => void remove(domain)}
              >
                {busy === domain ? <span class="spinner" /> : t.unblock}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
