import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useSnapshot } from "valtio";
import { t } from "../../i18n/pt-BR";
import { userMessageForError } from "../../lib/errors";
import { clientFor } from "../../lib/identity";
import type { FeedAdapter } from "../../lib/paged-feed";
import { scrollFeedToTop } from "../../lib/scroll";
import { snapshotValue } from "../../lib/snapshot";
import type { Status } from "../../api/types";
import { clearHomeQueue, currentAccount, putStatuses, statusKey, store } from "../../state/store";
import { useElementVisible, usePageVisible, usePagedFeed, type PagedFeed } from "../../state/hooks";
import { StatusCard } from "../status/StatusCard";
import { Icon } from "../ui/Icon";
import {
  fetchStatusPage,
  fetchTimelineUpdate,
  timelineSupportsUpdates,
  type TimelineKind,
} from "./timeline-fetch";
import "./feed.css";

interface TimelineProps {
  kind: TimelineKind;
  instance?: string;
  emptyTitle?: string;
  emptyHint?: string;
  listenQueue?: boolean;
  limit?: number;
  /** Per-column refresh token from ColumnRefreshButton. */
  refreshKey?: number;
  /** Cached keys hidden from the list (e.g. pinned posts shown above it). */
  excludeKeys?: ReadonlySet<string>;
}

/** Adapter wiring the pure feed machine to the endpoint fetch and status cache. */
function makeTimelineAdapter(
  kind: TimelineKind,
  limit: number,
  targetInstance: string,
): FeedAdapter<Status> {
  return {
    fetchPage: async (cursor) => {
      const page = await fetchStatusPage(kind, limit, cursor, clientFor(targetInstance));
      putStatuses([...page.items], targetInstance);
      return page;
    },
    keyOf: statusKey,
    cursorOf: (status) => status.id,
  };
}

export function Timeline({
  kind,
  instance,
  emptyTitle,
  emptyHint,
  listenQueue = false,
  limit = 20,
  refreshKey = 0,
  excludeKeys,
}: TimelineProps): JSX.Element {
  const snap = useSnapshot(store);
  const rootRef = useRef<HTMLDivElement>(null);
  const kindKey = JSON.stringify(kind);
  const account = currentAccount();
  const targetInstance = instance ?? account?.instance ?? "";
  // Global invalidation (e.g. cleanup) and boost toggles; the per-column
  // refresh uses refreshKey so it does not reload the other columns.
  const revision = `|${snap.ui.feedsRevision}${
    kind.type === "boosts" ? `|${snap.ui.boostsRevision}` : ""
  }`;
  const queue: Status[] = listenQueue
    ? snap.homeQueue
        .map((key) => snapshotValue<Status>(snap.statuses[key]))
        .filter((status): status is Status => !!status)
    : [];

  const feed = usePagedFeed<Status>({
    key: `${kindKey}|${targetInstance}|${refreshKey}${revision}`,
    enabled: !!targetInstance,
    adapter: makeTimelineAdapter(kind, limit, targetInstance),
    queue,
    queueMode: "manual",
    onFlushQueue: clearHomeQueue,
  });
  const [hasUpdates, setHasUpdates] = useState(false);
  const elementVisible = useElementVisible(rootRef);
  const pageVisible = usePageVisible();
  const canCheckUpdates = timelineSupportsUpdates(kind);

  useEffect(() => {
    setHasUpdates(false);
  }, [kindKey, targetInstance, refreshKey]);

  useEffect(() => {
    if (
      !canCheckUpdates ||
      !feed.ready ||
      feed.loading ||
      feed.loadingMore ||
      !feed.items.length ||
      hasUpdates ||
      !elementVisible ||
      !pageVisible
    ) {
      return;
    }
    const latestId = feed.items[0]?.id;
    if (!latestId) return;
    let cancelled = false;
    let timer = 0;

    const check = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const updated = await fetchTimelineUpdate(kind, latestId, clientFor(targetInstance));
        if (updated) {
          if (!cancelled) setHasUpdates(true);
          return;
        }
      } catch (err) {
        console.warn("[oltn] timeline update check failed", err);
      }
      if (!cancelled) timer = window.setTimeout(check, updateInterval(rootRef.current));
    };

    timer = window.setTimeout(check, updateInterval(rootRef.current));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    canCheckUpdates,
    feed.ready,
    feed.loading,
    feed.loadingMore,
    feed.items,
    hasUpdates,
    elementVisible,
    pageVisible,
    kindKey,
    targetInstance,
  ]);

  const showUpdates = (): void => {
    if (hasUpdates) {
      setHasUpdates(false);
      if (kind.type === "home") clearHomeQueue();
      feed.reload();
    } else {
      feed.flushQueue();
    }
    scrollFeedToTop(rootRef.current);
  };

  return (
    <div class="timeline" ref={rootRef}>
      <UpdatesPill feed={feed} hasUpdates={hasUpdates} onShowUpdates={showUpdates} />
      <TimelineBody
        feed={feed}
        emptyTitle={emptyTitle}
        emptyHint={emptyHint}
        excludeKeys={excludeKeys}
      />
    </div>
  );
}

function updateInterval(root: HTMLElement | null): number {
  const scroller = root?.closest(".deck-body") as HTMLElement | null;
  return (scroller?.scrollTop ?? 0) < 16 ? 15_000 : 30_000;
}

function UpdatesPill({
  feed,
  hasUpdates,
  onShowUpdates,
}: {
  feed: PagedFeed<Status>;
  hasUpdates: boolean;
  onShowUpdates: () => void;
}): JSX.Element | null {
  if (!feed.queue.length && !hasUpdates) return null;
  return (
    <button type="button" class="updates-pill" onClick={onShowUpdates}>
      <Icon name="arrow-down-line" size={15} />
      {feed.queue.length
        ? `${feed.queue.length} ${feed.queue.length === 1 ? t.queueOne : t.queueMany}`
        : t.newPosts}
    </button>
  );
}

function TimelineBody({
  feed,
  emptyTitle,
  emptyHint,
  excludeKeys,
}: {
  feed: PagedFeed<Status>;
  emptyTitle?: string;
  emptyHint?: string;
  excludeKeys?: ReadonlySet<string>;
}): JSX.Element {
  if (feed.loading && !feed.items.length) return <TimelineSkeleton />;
  if (feed.error && !feed.items.length)
    return <TimelineErrorState error={feed.error} onRetry={feed.reload} />;
  if (!feed.items.length) return <TimelineEmptyState title={emptyTitle} hint={emptyHint} />;
  const items =
    excludeKeys && excludeKeys.size
      ? feed.items.filter((status) => !excludeKeys.has(statusKey(status)))
      : feed.items;
  return (
    <>
      {items.map((status) => (
        <StatusCard key={statusKey(status)} statusKey={statusKey(status)} />
      ))}
      <TimelinePager feed={feed} />
    </>
  );
}

function TimelineErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}): JSX.Element {
  return (
    <div class="center-state">
      <Icon name="wifi-off-line" size={28} />
      <h3>{userMessageForError(error, t.errorLoad)}</h3>
      <button type="button" class="btn ghost" onClick={onRetry}>
        <Icon name="refresh-2-line" size={16} />
        {t.retry}
      </button>
    </div>
  );
}

function TimelineEmptyState({ title, hint }: { title?: string; hint?: string }): JSX.Element {
  return (
    <div class="center-state">
      <Icon name="quill-pen-line" size={28} />
      <h3>{title ?? t.empty}</h3>
      {hint && <p>{hint}</p>}
    </div>
  );
}

function TimelinePager({ feed }: { feed: PagedFeed<Status> }): JSX.Element | null {
  if (feed.moreError) {
    return (
      <div class="load-more load-more-error">
        <span class="muted">{userMessageForError(feed.moreError, t.errorLoad)}</span>
        <button type="button" class="btn ghost" onClick={feed.loadMore}>
          <Icon name="refresh-2-line" size={16} />
          {t.retry}
        </button>
      </div>
    );
  }
  if (!feed.hasMore) return null;
  return (
    <div class="load-more">
      <button type="button" class="btn ghost" onClick={feed.loadMore} disabled={feed.loadingMore}>
        {feed.loadingMore ? <span class="spinner" /> : <Icon name="dropdown-line" size={16} />}
        {feed.loadingMore ? t.loadingMore : t.loadMore}
      </button>
    </div>
  );
}

export function TimelineSkeleton(): JSX.Element {
  return (
    <div class="timeline-skeleton" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <div class="sk-row" key={i}>
          <div class="skeleton sk-avatar" />
          <div class="sk-lines">
            <div class="skeleton sk-line w40" />
            <div class="skeleton sk-line w90" />
            <div class="skeleton sk-line w75" />
          </div>
        </div>
      ))}
    </div>
  );
}
