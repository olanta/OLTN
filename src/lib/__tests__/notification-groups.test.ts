import { describe, expect, it } from "vitest";
import type { Account, Notification, Status } from "../../api/types";
import {
  groupNotificationsForDisplay,
  groupedNotificationsFromResult,
  notificationGroupKey,
} from "../notification-groups";

const bob = { id: "2", username: "bob", acct: "bob", displayName: "Bob", avatar: "" } as Account;
const carol = {
  id: "3",
  username: "carol",
  acct: "carol",
  displayName: "Carol",
  avatar: "",
} as Account;
const status = {
  id: "90",
  uri: "https://example.test/90",
  createdAt: "2026-01-01T00:00:00Z",
} as Status;

function notification(id: string, type: string, account = bob): Notification {
  return { id, type, account, status, createdAt: "2026-01-01T00:00:00Z" } as Notification;
}

describe("notification grouping", () => {
  it("groups favourites and reblogs for the same status, and follows together", () => {
    const grouped = groupNotificationsForDisplay([
      notification("1", "favourite", bob),
      notification("2", "follow", bob),
      notification("3", "favourite", carol),
      notification("4", "mention", carol),
    ]);
    expect(grouped.map((item) => item.key)).toEqual(["favourite:90", "follow", "single:4"]);
    expect(grouped[0]).toMatchObject({ count: 2, accounts: [bob, carol] });
    expect(grouped[1].count).toBe(1);
    expect(notificationGroupKey(notification("5", "reblog", carol))).toBe("reblog:90");
  });

  it("uses the page cursor for the next fallback page", () => {
    const grouped = groupNotificationsForDisplay(
      [notification("10", "favourite"), notification("9", "mention")],
      "9",
    );
    expect(grouped.at(-1)?.cursor).toBe("9");
  });

  it("maps a v2 grouped result and resolves accounts and statuses", () => {
    const grouped = groupedNotificationsFromResult({
      accounts: [bob, carol],
      statuses: [status],
      notificationGroups: [
        {
          groupKey: "fav-90",
          notificationsCount: 2,
          type: "favourite",
          mostRecentNotificationId: "20",
          pageMinId: "19",
          latestPageNotificationAt: "2026-01-01T00:00:00Z",
          sampleAccountIds: ["2", "3"],
          statusId: "90",
        },
      ],
    });
    expect(grouped[0]).toMatchObject({
      key: "favourite:90",
      count: 2,
      accounts: [bob, carol],
      status,
      cursor: "19",
      mostRecentNotificationId: "20",
    });
  });
});
