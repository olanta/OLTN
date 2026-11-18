import { describe, expect, it } from "vitest";
import type { CleanupPolicy, RestClient, Status } from "../../api/types";
import {
  cleanupCooldownActive,
  cleanupCooldownUntil,
  cleanupDue,
  cleanupPolicyWidened,
  DEFAULT_CLEANUP_POLICY,
  normalizeCleanupPolicy,
  runCleanup,
  shouldDeleteStatus,
} from "../cleanup";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-01-15T12:00:00Z");
const POLICY: CleanupPolicy = { ...DEFAULT_CLEANUP_POLICY, minStatusAge: (14 * DAY) / 1000 };
const CUTOFF = NOW - POLICY.minStatusAge * 1000;

let sequence = 0;

function status(ageDays: number, patch: Partial<Status> = {}): Status {
  return {
    id: `status-${++sequence}`,
    createdAt: new Date(NOW - ageDays * DAY).toISOString(),
    visibility: "public",
    pinned: false,
    favourited: false,
    bookmarked: false,
    poll: null,
    mediaAttachments: [],
    favouritesCount: 0,
    reblogsCount: 0,
    reblog: null,
    ...patch,
  } as Status;
}

function fakeClient(statuses: Status[], removed: string[]): RestClient {
  return {
    v1: {
      accounts: {
        $select: () => ({ statuses: { list: async () => statuses } }),
      },
      statuses: {
        $select: (id: string) => ({
          remove: async () => {
            removed.push(id);
          },
        }),
      },
    },
  } as unknown as RestClient;
}

describe("shouldDeleteStatus", () => {
  it("only deletes posts older than the threshold", () => {
    expect(shouldDeleteStatus(status(15), POLICY, CUTOFF)).toBe(true);
    expect(shouldDeleteStatus(status(1), POLICY, CUTOFF)).toBe(false);
  });

  it("honours the exception flags", () => {
    expect(shouldDeleteStatus(status(15, { pinned: true }), POLICY, CUTOFF)).toBe(false);
    expect(shouldDeleteStatus(status(15, { visibility: "direct" }), POLICY, CUTOFF)).toBe(false);
    expect(shouldDeleteStatus(status(15, { favourited: true }), POLICY, CUTOFF)).toBe(false);
    expect(shouldDeleteStatus(status(15, { bookmarked: true }), POLICY, CUTOFF)).toBe(false);
  });

  it("honours the poll and media exceptions", () => {
    const keep = { ...POLICY, keepPolls: true, keepMedia: true };
    const poll = {} as unknown as Status["poll"];
    const media = [{}] as unknown as Status["mediaAttachments"];
    expect(shouldDeleteStatus(status(15, { poll }), keep, CUTOFF)).toBe(false);
    expect(shouldDeleteStatus(status(15, { mediaAttachments: media }), keep, CUTOFF)).toBe(false);
    expect(shouldDeleteStatus(status(15, { poll }), POLICY, CUTOFF)).toBe(true);
  });

  it("treats boosts as account statuses, matching the server policy", () => {
    const boost = status(15, { reblog: {} as Status });
    expect(shouldDeleteStatus(boost, POLICY, CUTOFF)).toBe(true);
  });

  it("honours the interaction minimums", () => {
    const policy = { ...POLICY, minFavourites: 5, minBoosts: 2 };
    expect(shouldDeleteStatus(status(15, { favouritesCount: 5 }), policy, CUTOFF)).toBe(false);
    expect(shouldDeleteStatus(status(15, { favouritesCount: 4 }), policy, CUTOFF)).toBe(true);
    expect(shouldDeleteStatus(status(15, { reblogsCount: 2 }), policy, CUTOFF)).toBe(false);
    expect(shouldDeleteStatus(status(15, { reblogsCount: 1 }), policy, CUTOFF)).toBe(true);
  });
});

describe("normalizeCleanupPolicy", () => {
  it("fills defaults and maps legacy day values to the allowed ages", () => {
    expect(normalizeCleanupPolicy(undefined)).toEqual(DEFAULT_CLEANUP_POLICY);
    expect(normalizeCleanupPolicy({ minStatusAge: 0 }).minStatusAge).toBe(
      DEFAULT_CLEANUP_POLICY.minStatusAge,
    );
    expect(normalizeCleanupPolicy({ ageDays: 14 }).minStatusAge).toBe((14 * DAY) / 1000);
    expect(normalizeCleanupPolicy({ minStatusAge: 123 }).minStatusAge).toBe((7 * DAY) / 1000);
    expect(normalizeCleanupPolicy({ minFavourites: -10 }).minFavourites).toBe(0);
    expect(normalizeCleanupPolicy({ enabled: "yes" }).enabled).toBe(false);
  });
});

describe("cleanupDue", () => {
  it("requires an enabled policy and a 24 hour gap", () => {
    expect(cleanupDue(undefined, undefined, NOW)).toBe(false);
    expect(cleanupDue({ ...POLICY, enabled: false }, undefined, NOW)).toBe(false);
    expect(cleanupDue({ ...POLICY, enabled: true }, undefined, NOW)).toBe(true);
    expect(cleanupDue({ ...POLICY, enabled: true }, NOW - 1000, NOW)).toBe(false);
    expect(cleanupDue({ ...POLICY, enabled: true }, NOW - DAY, NOW)).toBe(true);
  });
});

describe("cleanupCooldownActive", () => {
  it("blocks runs until the cooldown expires", () => {
    expect(cleanupCooldownActive(undefined, NOW)).toBe(false);
    expect(cleanupCooldownActive(NOW + 1000, NOW)).toBe(true);
    expect(cleanupCooldownActive(NOW - 1000, NOW)).toBe(false);
  });
});

describe("cleanupCooldownUntil", () => {
  const base = { scanned: 30, deleted: 30, failed: 0, kept: 0, stopped: false, rateLimited: false };

  it("covers full batches and rate limits", () => {
    expect(cleanupCooldownUntil(base, NOW)).toBeGreaterThan(NOW);
    expect(cleanupCooldownUntil({ ...base, deleted: 0, rateLimited: true }, NOW)).toBeGreaterThan(
      NOW,
    );
  });

  it("does not cooldown a scan-only stop", () => {
    expect(cleanupCooldownUntil({ ...base, deleted: 10, stopped: true }, NOW)).toBe(0);
  });
});

describe("cleanupPolicyWidened", () => {
  it("invalidates the cursor when the policy keeps less", () => {
    expect(cleanupPolicyWidened(POLICY, { ...POLICY, keepPinned: false })).toBe(true);
    expect(
      cleanupPolicyWidened({ ...POLICY, minFavourites: 5 }, { ...POLICY, minFavourites: 10 }),
    ).toBe(true);
    expect(
      cleanupPolicyWidened({ ...POLICY, minFavourites: 5 }, { ...POLICY, minFavourites: 0 }),
    ).toBe(true);
    expect(cleanupPolicyWidened(POLICY, { ...POLICY, keepPinned: true })).toBe(false);
    expect(
      cleanupPolicyWidened({ ...POLICY, minFavourites: 5 }, { ...POLICY, minFavourites: 3 }),
    ).toBe(false);
  });
});

describe("runCleanup", () => {
  it("removes matching posts and keeps exceptions", async () => {
    const removed: string[] = [];
    const deleted: Status[] = [];
    const old = status(20);
    const pinned = status(20, { pinned: true });
    const recent = status(2);
    const result = await runCleanup({
      client: fakeClient([old, pinned, recent], removed),
      accountId: "me",
      policy: POLICY,
      now: NOW,
      sleep: async () => {},
      onDeleted: (item) => deleted.push(item),
    });

    expect(removed).toEqual([old.id]);
    expect(deleted.map((item) => item.id)).toEqual([old.id]);
    expect(result).toMatchObject({
      scanned: 2,
      deleted: 1,
      failed: 0,
      kept: 1,
      stopped: false,
      rateLimited: false,
      inspectedThrough: CUTOFF,
    });
    expect(result.cursor).toBeUndefined();
  });

  it("keeps paging after a full page", async () => {
    const removed: string[] = [];
    const firstPage = Array.from({ length: 40 }, () => status(30, { pinned: true }));
    const old = status(60);
    const pages = [firstPage, [old]];
    let page = 0;
    const result = await runCleanup({
      client: {
        v1: {
          accounts: {
            $select: () => ({
              statuses: { list: async () => pages[page++] ?? [] },
            }),
          },
          statuses: {
            $select: (id: string) => ({
              remove: async () => {
                removed.push(id);
              },
            }),
          },
        },
      } as unknown as RestClient,
      accountId: "me",
      policy: POLICY,
      now: NOW,
      sleep: async () => {},
    });

    expect(removed).toEqual([old.id]);
    expect(result.scanned).toBe(41);
    expect(result.deleted).toBe(1);
    expect(result.inspectedThrough).toBe(CUTOFF);
  });

  it("defaults to the 30 deletion budget and returns a resume cursor", async () => {
    const removed: string[] = [];
    const result = await runCleanup({
      client: fakeClient(
        Array.from({ length: 35 }, () => status(20)),
        removed,
      ),
      accountId: "me",
      policy: POLICY,
      now: NOW,
      sleep: async () => {},
    });

    expect(removed).toHaveLength(30);
    expect(result.deleted).toBe(30);
    expect(result.stopped).toBe(true);
    expect(result.cursor?.cutoff).toBe(CUTOFF);
    expect(result.cursor?.floor).toBe(0);
  });

  it("resumes after the last inspected status", async () => {
    const first = status(20);
    const second = status(30);
    const firstPage = [first, ...Array.from({ length: 39 }, () => status(30, { pinned: true }))];
    const removed: string[] = [];
    let calls = 0;
    const client = {
      v1: {
        accounts: {
          $select: () => ({
            statuses: {
              list: async ({ maxId }: { maxId?: string }) => {
                calls += 1;
                if (calls === 1) return firstPage;
                return maxId === first.id ? [second] : [];
              },
            },
          }),
        },
        statuses: {
          $select: (id: string) => ({
            remove: async () => {
              removed.push(id);
            },
          }),
        },
      },
    } as unknown as RestClient;

    const firstRun = await runCleanup({
      client,
      accountId: "me",
      policy: POLICY,
      now: NOW,
      maxDeletes: 1,
      sleep: async () => {},
    });
    expect(removed).toEqual([first.id]);
    expect(firstRun.cursor?.maxId).toBe(first.id);

    const secondRun = await runCleanup({
      client,
      accountId: "me",
      policy: POLICY,
      state: { cursor: firstRun.cursor },
      now: NOW,
      sleep: async () => {},
    });
    expect(removed).toEqual([first.id, second.id]);
    expect(secondRun.cursor).toBeUndefined();
    expect(secondRun.inspectedThrough).toBe(CUTOFF);
  });

  it("stops when the API rate limits without skipping the failed post", async () => {
    const first = status(20);
    const failed = status(30);
    const removed: string[] = [];
    const client = {
      v1: {
        accounts: {
          $select: () => ({ statuses: { list: async () => [first, failed] } }),
        },
        statuses: {
          $select: (id: string) => ({
            remove: async () => {
              if (id === failed.id) throw { statusCode: 429 };
              removed.push(id);
            },
          }),
        },
      },
    } as unknown as RestClient;

    const result = await runCleanup({
      client,
      accountId: "me",
      policy: POLICY,
      now: NOW,
      sleep: async () => {},
    });

    expect(removed).toEqual([first.id]);
    expect(result.failed).toBe(1);
    expect(result.stopped).toBe(true);
    expect(result.rateLimited).toBe(true);
    expect(result.cursor?.maxId).toBe(first.id);
  });
});
