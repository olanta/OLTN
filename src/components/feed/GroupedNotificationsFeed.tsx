import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { useSnapshot } from "valtio";
import type { GroupedNotificationsResult, Notification, Status } from "../../api/types";
import { t } from "../../i18n/pt-BR";
import {
  groupNotificationsForDisplay,
  groupedNotificationsFromResult,
  notificationGroupKey,
  type NotificationGroupView,
} from "../../lib/notification-groups";
import { clientFor, hrefFor } from "../../lib/identity";
import { navigate } from "../../lib/router";
import { scrollFeedToTop } from "../../lib/scroll";
import { snapshotValue } from "../../lib/snapshot";
import { currentAccount, pushNotification, putStatuses, statusKey, store } from "../../state/store";
import { useElementVisible, usePageVisible, usePagedFeed } from "../../state/hooks";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { EmojiText } from "../status/EmojiText";
import { StatusCard } from "../status/StatusCard";
import { TimelineSkeleton } from "./Timeline";
import { TYPE_ICON, notificationTypeText } from "./NotificationsFeed";

const PAGE = 20;

export function GroupedNotificationsFeed({
  instance,
  refreshKey = 0,
}: {
  instance: string;
  refreshKey?: number;
}): JSX.Element {
  const snap = useSnapshot(store);
  const account = currentAccount();
  const rootRef = useRef<HTMLDivElement>(null);
  const visible = useElementVisible(rootRef) && usePageVisible();
  const fallback = useRef(false);
  const queued = snap.notifQueue.map((n) => snapshotValue<Notification>(n));
  const queue = groupNotificationsForDisplay(queued);

  const feed = usePagedFeed<NotificationGroupView>({
    key: `${instance}|grouped|${snap.ui.feedsRevision}|${refreshKey}`,
    enabled: !!account,
    adapter: {
      fetchPage: async (cursor) => {
        const client = clientFor(instance).client;
        if (!fallback.current) {
          try {
            const result = (await client.v2.notifications.list({
              limit: PAGE,
              maxId: cursor ?? undefined,
              groupedTypes: ["favourite", "reblog", "follow"],
              expandAccounts: "full",
            })) as unknown as GroupedNotificationsResult;
            putStatuses(result.statuses, instance);
            return {
              items: groupedNotificationsFromResult(result),
              hasMore: result.notificationGroups.length >= PAGE,
            };
          } catch (err) {
            console.warn("[oltn] grouped notifications unavailable, falling back", err);
            fallback.current = true;
          }
        }
        const page = await client.v1.notifications.list({
          limit: PAGE,
          maxId: cursor ?? undefined,
        });
        putStatuses(
          page.map((n) => n.status).filter((s): s is Status => !!s),
          instance,
        );
        return {
          items: groupNotificationsForDisplay(page, page[page.length - 1]?.id),
          hasMore: page.length >= PAGE,
        };
      },
      keyOf: (item) => item.key,
      cursorOf: (item) => item.cursor,
    },
    queue,
    queueMode: "manual",
    onFlushQueue: () => {
      store.notifQueue = [];
      store.notifBadge = 0;
    },
  });

  useEffect(() => {
    if (!visible || !feed.ready) return;
    const keys = new Set(feed.items.map((item) => item.key));
    const remaining = store.notifQueue.filter((n) => !keys.has(notificationGroupKey(n)));
    store.notifQueue = remaining;
    if (!remaining.length) store.notifBadge = 0;
  }, [visible, feed.ready, feed.items]);

  useEffect(() => {
    if (snap.stream === "on" || !visible || !feed.ready || feed.loading || !feed.items.length) {
      return;
    }
    let cursor = feed.items[0]?.mostRecentNotificationId;
    if (!cursor) return;
    let cancelled = false;
    let timer = 0;

    const check = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const page = await clientFor(instance).client.v1.notifications.list({
          limit: 20,
          sinceId: cursor,
        });
        if (page.length && page[0]?.id !== cursor) {
          putStatuses(
            page.map((n) => n.status).filter((s): s is Status => !!s),
            instance,
          );
          for (const notification of page) pushNotification(notification);
          cursor = page[0].id;
        }
      } catch (err) {
        console.warn("[oltn] grouped notification update check failed", err);
      }
      if (!cancelled) timer = window.setTimeout(check, 30_000);
    };

    timer = window.setTimeout(check, 30_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [snap.stream, visible, feed.ready, feed.loading, feed.items, instance]);

  const openGroup = (item: NotificationGroupView): void => {
    if (item.status) {
      navigate(hrefFor.status(item.status.id, instance));
      return;
    }
    const first = item.accounts[0];
    if (first) navigate(hrefFor.accountById(instance, first.id));
  };

  if (feed.loading && !feed.items.length) {
    return (
      <div ref={rootRef}>
        <TimelineSkeleton />
      </div>
    );
  }

  if (feed.error && !feed.items.length) {
    return (
      <div ref={rootRef}>
        <div class="center-state">
          <Icon name="wifi-off-line" size={28} />
          <h3>{t.errorLoad}</h3>
          <button type="button" class="btn ghost" onClick={feed.reload}>
            <Icon name="refresh-2-line" size={16} />
            {t.retry}
          </button>
        </div>
      </div>
    );
  }

  if (!feed.items.length) {
    return (
      <div ref={rootRef}>
        <div class="center-state">
          <Icon name="notification-line" size={28} />
          <h3>{t.emptyNotifications}</h3>
          <p>{t.emptyHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      <div class="notifications">
        {feed.queue.length > 0 && (
          <button
            type="button"
            class="updates-pill"
            onClick={() => {
              feed.flushQueue();
              scrollFeedToTop(rootRef.current);
            }}
          >
            <Icon name="arrow-down-line" size={15} />
            {feed.queue.length} {t.newNotifications}
          </button>
        )}
        {feed.items.map((item) => {
          const first = item.accounts[0];
          const repeated = item.count > 1;
          const time = item.createdAt ? new Date(item.createdAt) : null;
          return (
            <div class={`notif-group type-${item.type}`} key={item.key}>
              <button type="button" class="notif-head" onClick={() => openGroup(item)}>
                <span class="notif-icon">
                  <Icon name={TYPE_ICON[item.type] ?? "notification-line"} size={14} />
                </span>
                <span class="notif-avatars">
                  {item.accounts.slice(0, 4).map((accountItem) => (
                    <Avatar
                      key={accountItem.id}
                      src={accountItem.avatar}
                      name={accountItem.displayName || accountItem.username}
                      size={34}
                    />
                  ))}
                </span>
                <span class="notif-text">
                  {first ? (
                    <>
                      <strong>
                        <EmojiText
                          text={first.displayName || first.username}
                          emojis={first.emojis}
                        />
                      </strong>{" "}
                      {notificationTypeText(item.type)}
                    </>
                  ) : (
                    notificationTypeText(item.type)
                  )}
                  {repeated && <span class="notif-count"> +{item.count - 1}</span>}
                </span>
                {time && (
                  <span class="notif-time muted">
                    {time.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </span>
                )}
              </button>
              {item.status && <StatusCard statusKey={statusKey(item.status)} compact hideHeader />}
            </div>
          );
        })}
        {feed.moreError ? (
          <div class="load-more load-more-error">
            <span class="muted">{t.errorLoad}</span>
            <button type="button" class="btn ghost" onClick={feed.loadMore}>
              <Icon name="refresh-2-line" size={16} />
              {t.retry}
            </button>
          </div>
        ) : (
          feed.hasMore && (
            <div class="load-more">
              <button
                type="button"
                class="btn ghost"
                disabled={feed.loadingMore}
                onClick={feed.loadMore}
              >
                {feed.loadingMore ? (
                  <span class="spinner" />
                ) : (
                  <Icon name="dropdown-line" size={16} />
                )}
                {feed.loadingMore ? t.loadingMore : t.loadMore}
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
