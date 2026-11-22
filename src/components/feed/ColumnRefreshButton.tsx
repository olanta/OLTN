import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../../i18n/pt-BR";
import { bumpFeedRevision } from "../../state/store";
import { Icon } from "../ui/Icon";

const FEEDBACK_MS = 800;

/** Refresh control with a short rotation so the click is visible. */
export function ColumnRefreshButton({
  label,
  feedKey,
  onRefresh,
}: {
  label: string;
  /** Shortcut id: only that column's feed is reloaded. */
  feedKey: string;
  onRefresh?: () => void;
}): JSX.Element {
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const refresh = (): void => {
    bumpFeedRevision(feedKey);
    onRefresh?.();
    setRefreshing(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setRefreshing(false), FEEDBACK_MS);
  };

  const title = refreshing ? t.refreshing : t.refresh;
  return (
    <button
      type="button"
      class={`icon-btn col-refresh ${refreshing ? "refreshing" : ""}`}
      title={`${title}: ${label}`}
      aria-label={`${title}: ${label}`}
      aria-busy={refreshing}
      disabled={refreshing}
      onClick={refresh}
    >
      <Icon name="refresh-2-line" size={15} />
    </button>
  );
}
