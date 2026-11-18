import { beforeEach, describe, expect, it } from "vitest";
import type { Account, RestClient, Status } from "../../api/types";
import {
  clearDiscoverCache,
  DISCOVER_CATEGORIES,
  discoverAccounts,
  rankDiscoverCandidates,
  scoreDiscoverCandidate,
  type DiscoverCandidate,
} from "../discover";

const ART = DISCOVER_CATEGORIES[0];
const NOW = Date.parse("2026-01-15T12:00:00Z");

function account(id: string, patch: Partial<Account> = {}): Account {
  return {
    id,
    username: id,
    acct: `${id}@example.social`,
    displayName: id,
    note: "",
    avatar: "",
    followersCount: 10,
    statusesCount: 10,
    ...patch,
  } as Account;
}

function status(author: Account, ageDays = 1, patch: Partial<Status> = {}): Status {
  return {
    account: author,
    createdAt: new Date(NOW - ageDays * 24 * 60 * 60 * 1000).toISOString(),
    reblog: null,
    ...patch,
  } as Status;
}

function clientWith(
  searchAccounts: Account[],
  tagAccounts: Account[],
  failSearch = false,
  failTags = false,
): RestClient {
  return {
    v2: {
      search: {
        list: async () => {
          if (failSearch) throw new Error("search failed");
          return { accounts: searchAccounts };
        },
      },
    },
    v1: {
      timelines: {
        tag: {
          $select: () => ({
            list: async () => {
              if (failTags) throw new Error("tag failed");
              return tagAccounts.map((author) => status(author));
            },
          }),
        },
      },
    },
  } as unknown as RestClient;
}

beforeEach(() => clearDiscoverCache());

describe("DISCOVER_CATEGORIES", () => {
  it("has unique ids and usable queries/tags", () => {
    const ids = DISCOVER_CATEGORIES.map((category) => category.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const category of DISCOVER_CATEGORIES) {
      expect(category.tags.length).toBeGreaterThan(0);
      expect(category.keywords.length).toBeGreaterThan(0);
      expect(category.query.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("scoreDiscoverCandidate", () => {
  it("rewards topic posts, keyword matches and recency", () => {
    const base: DiscoverCandidate = {
      account: account("plain"),
      tagHits: 0,
      searchHits: 0,
      lastSeen: 0,
    };
    const relevant: DiscoverCandidate = {
      account: account("artist", { note: "<p>I paint and draw every day.</p>" }),
      tagHits: 4,
      searchHits: 1,
      lastSeen: NOW - 2 * 24 * 60 * 60 * 1000,
    };

    expect(scoreDiscoverCandidate(relevant, ART, NOW)).toBeGreaterThan(
      scoreDiscoverCandidate(base, ART, NOW),
    );
  });
});

describe("rankDiscoverCandidates", () => {
  it("sorts by score and caps the result", () => {
    const candidates: DiscoverCandidate[] = [
      { account: account("small"), tagHits: 1, searchHits: 0, lastSeen: 0 },
      {
        account: account("active", { note: "artist illustration design" }),
        tagHits: 5,
        searchHits: 1,
        lastSeen: NOW,
      },
    ];
    expect(rankDiscoverCandidates(candidates, ART, NOW, 1)[0]?.id).toBe("active");
  });
});

describe("discoverAccounts", () => {
  it("combines search and hashtag authors, excludes the viewer and dedupes", async () => {
    const me = account("me");
    const artist = account("artist", { note: "artist and illustrator" });
    const painter = account("painter", { note: "painting" });
    const accounts = await discoverAccounts(
      clientWith([me, artist], [artist, painter]),
      "example.social",
      ART,
      me.id,
      NOW,
    );

    expect(accounts.map((entry) => entry.id)).toEqual(["artist", "painter"]);
  });

  it("returns cached results for the same viewer and category", async () => {
    const artist = account("artist");
    const first = await discoverAccounts(
      clientWith([artist], []),
      "example.social",
      ART,
      "me",
      NOW,
    );
    const second = await discoverAccounts(
      clientWith([], [], true, true),
      "example.social",
      ART,
      "me",
      NOW + 1000,
    );
    expect(second).toBe(first);
  });

  it("fails only when every source fails", async () => {
    await expect(
      discoverAccounts(clientWith([], [], true, true), "example.social", ART, "me", NOW),
    ).rejects.toThrow("discover_failed");
  });
});
