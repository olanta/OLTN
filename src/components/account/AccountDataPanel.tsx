import type { JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import { getRest } from "../../api/client";
import { t } from "../../i18n/pt-BR";
import {
  backupCounts,
  backupFileName,
  collectBackup,
  parseBackup,
  type Backup,
} from "../../lib/backup";
import { userMessageForError } from "../../lib/errors";
import {
  importAccountData,
  type ImportPhase,
  type ImportProgress,
  type ImportSummary,
} from "../../lib/import-backup";
import { replacePrefs, saveSettings } from "../../state/boot";
import { accountNS, currentAccount, store, toast } from "../../state/store";
import { Icon } from "../ui/Icon";

const IMPORT_PHASES: Record<ImportPhase, () => string> = {
  following: () => t.following,
  lists: () => t.lists,
  filters: () => t.filters,
  mutes: () => t.mutes,
  blocks: () => t.blocks,
  domains: () => t.domainBlocks,
};

export function AccountDataPanel(): JSX.Element {
  const [exporting, setExporting] = useState(false);
  const [pending, setPending] = useState<Backup | null>(null);
  const [importing, setImporting] = useState<ImportProgress | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef(false);

  const exportData = async (): Promise<void> => {
    const account = currentAccount();
    if (!account || exporting || importing) return;
    setExporting(true);
    try {
      const client = getRest(account.instance, account.accessToken);
      const backup = await collectBackup(
        client,
        account,
        store.settings,
        store.prefs[accountNS(account)],
      );
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = backupFileName();
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(t.exportDone, "ok");
    } catch (err) {
      console.warn("[oltn] backup export failed", err);
      toast(userMessageForError(err), "error");
    } finally {
      setExporting(false);
    }
  };

  const chooseFile = async (e: Event): Promise<void> => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast(t.importInvalid, "error");
      return;
    }
    const parsed = parseBackup(await file.text());
    if (!parsed) {
      toast(t.importInvalid, "error");
      return;
    }
    setImportSummary(null);
    setPending(parsed);
  };

  const startImport = async (): Promise<void> => {
    const backup = pending;
    const account = currentAccount();
    if (!backup || !account || importing) return;
    setPending(null);
    setImportSummary(null);
    cancelRef.current = false;
    store.settings = backup.settings;
    saveSettings();
    replacePrefs(backup.prefs);
    setImporting({ phase: "following", done: 0, total: backup.following.length });
    try {
      const summary = await importAccountData(
        getRest(account.instance, account.accessToken),
        backup,
        {
          onProgress: setImporting,
          isCancelled: () => cancelRef.current,
        },
      );
      setImportSummary(summary);
      toast(
        cancelRef.current ? t.importCancelled : t.importDone,
        cancelRef.current ? undefined : "ok",
      );
    } catch (err) {
      console.warn("[oltn] backup import failed", err);
      toast(userMessageForError(err), "error");
    } finally {
      setImporting(null);
    }
  };

  const counts = pending ? backupCounts(pending) : null;

  return (
    <section class="account-panel">
      <div>
        <h2>{t.importExport}</h2>
        <p class="muted">{t.dataHint}</p>
      </div>
      <div class="btn-row">
        <button
          type="button"
          class="btn"
          disabled={exporting || !!importing}
          onClick={() => void exportData()}
        >
          {exporting ? <span class="spinner" /> : <Icon name="file-export-line" size={16} />}
          {t.exportData}
        </button>
        <button
          type="button"
          class="btn ghost"
          disabled={!!importing}
          onClick={() => fileRef.current?.click()}
        >
          <Icon name="file-import-line" size={16} />
          {t.importData}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        class="data-file-input"
        onChange={(e) => void chooseFile(e)}
      />
      {pending && counts && (
        <div class="data-preview">
          <strong>
            {t.importFrom} @{pending.account.acct || "?"}
          </strong>
          <ul class="data-counts">
            <li>
              {t.following}: {counts.following}
            </li>
            <li>
              {t.lists}: {counts.lists}
            </li>
            <li>
              {t.filters}: {counts.filters}
            </li>
            <li>
              {t.mutes}: {counts.mutes}
            </li>
            <li>
              {t.blocks}: {counts.blocks}
            </li>
            <li>
              {t.domainBlocks}: {counts.domainBlocks}
            </li>
          </ul>
          <p class="muted">{t.importWarning}</p>
          <div class="btn-row">
            <button type="button" class="btn primary" onClick={() => void startImport()}>
              {t.importStart}
            </button>
            <button type="button" class="btn ghost" onClick={() => setPending(null)}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}
      {importing && (
        <div class="data-progress">
          <span>
            {IMPORT_PHASES[importing.phase]()} {importing.done}/{importing.total}
          </span>
          <progress value={importing.done} max={Math.max(1, importing.total)} />
          <button
            type="button"
            class="btn ghost"
            onClick={() => {
              cancelRef.current = true;
            }}
          >
            {t.cancel}
          </button>
        </div>
      )}
      {importSummary && !importing && (
        <p class="muted">
          {t.following}: {importSummary.followed} · {t.lists}: {importSummary.lists} · {t.filters}:{" "}
          {importSummary.filters} · {t.mutes}: {importSummary.mutes} · {t.blocks}:{" "}
          {importSummary.blocks} · {t.domainBlocks}: {importSummary.domains}
          {importSummary.skipped > 0 && ` · ${t.importSkipped}: ${importSummary.skipped}`}
        </p>
      )}
    </section>
  );
}
