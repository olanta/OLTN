import type { Account, GroupedNotificationsResult, Notification, Status } from "../api/types";

export interface NotificationGroupView {
  key: string;
  type: string;
  count: number;
  accounts: Account[];
  status?: Status;
  createdAt: string;
  mostRecentNotificationId: string;
  /** Cursor for the next v1 page; the adapter reads it from the last item. */
  cursor: string;
}

export function notificationGroupKey(notification: Notification): string {
  if (notification.type === "follow") return "follow";
  const statusId = notification.status?.id;
  if (statusId && (notification.type === "favourite" || notification.type === "reblog")) {
    return `${notification.type}:${statusId}`;
  }
  return `single:${notification.id}`;
}

/** Local fallback grouping for servers without v2 grouped notifications. */
export function groupNotificationsForDisplay(
  notifications: readonly Notification[],
  pageCursor?: string,
): NotificationGroupView[] {
  const grouped = new Map<string, Notification[]>();
  const order: string[] = [];
  for (const notification of notifications) {
    const key = notificationGroupKey(notification);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(notification);
    } else {
      grouped.set(key, [notification]);
      order.push(key);
    }
  }

  const views = order.map((key) => {
    const items = grouped.get(key) ?? [];
    const accounts = [...new Map(items.map((item) => [item.account.id, item.account])).values()];
    const first = items[0];
    return {
      key,
      type: first.type,
      count: items.length,
      accounts,
      status: first.status ?? undefined,
      createdAt: first.createdAt,
      mostRecentNotificationId: first.id,
      cursor: items[items.length - 1]?.id ?? first.id,
    };
  });
  if (pageCursor && views.length) views[views.length - 1].cursor = pageCursor;
  return views;
}

/** Converts the v2 grouped result into the same view model used by the fallback. */
export function groupedNotificationsFromResult(
  result: GroupedNotificationsResult,
): NotificationGroupView[] {
  const accounts = new Map(result.accounts.map((account) => [account.id, account]));
  const statuses = new Map(result.statuses.map((status) => [status.id, status]));
  const views: NotificationGroupView[] = [];

  for (const group of result.notificationGroups) {
    const groupAccounts = group.sampleAccountIds
      .map((id) => accounts.get(id))
      .filter((account): account is Account => !!account);
    const status = group.statusId ? statuses.get(group.statusId) : undefined;
    const key =
      group.type === "follow"
        ? `follow:${group.groupKey}`
        : group.statusId && (group.type === "favourite" || group.type === "reblog")
          ? `${group.type}:${group.statusId}`
          : `single:${group.mostRecentNotificationId}`;
    views.push({
      key,
      type: group.type,
      count: group.notificationsCount,
      accounts: groupAccounts,
      status,
      createdAt: group.latestPageNotificationAt ?? status?.createdAt ?? "",
      mostRecentNotificationId: group.mostRecentNotificationId,
      cursor: group.pageMinId ?? group.pageMaxId ?? group.mostRecentNotificationId,
    });
  }
  return views;
}
