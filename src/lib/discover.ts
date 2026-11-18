/* Topic-based account discovery for Search. There is no directory endpoint in
   the Mastodon API, so each category combines account search with recent posts
   from a few hashtags and ranks the authors locally. */

import type { Account, RestClient, Status } from "../api/types";
import { htmlToPlainText } from "./format";

export interface DiscoverCategory {
  id: string;
  icon: string;
  tags: readonly string[];
  keywords: readonly string[];
  /** Account search query. */
  query: string;
}

export const DISCOVER_CATEGORIES = [
  {
    id: "art",
    icon: "palette-line",
    tags: ["art", "illustration", "design"],
    keywords: ["art", "artist", "illustration", "design", "painting", "drawing"],
    query: "artist art illustration design",
  },
  {
    id: "books",
    icon: "quill-pen-line",
    tags: ["books", "reading", "writing"],
    keywords: ["book", "books", "reading", "writer", "writing", "poetry", "author"],
    query: "books reading writer poetry",
  },
  {
    id: "cinema",
    icon: "movie-line",
    tags: ["film", "cinema", "movies"],
    keywords: ["film", "cinema", "movie", "movies", "tv", "television"],
    query: "film cinema movies television",
  },
  {
    id: "music",
    icon: "volume-line",
    tags: ["music", "musician", "band"],
    keywords: ["music", "musician", "band", "song", "album", "producer"],
    query: "music musician band producer",
  },
  {
    id: "tech",
    icon: "code-line",
    tags: ["tech", "opensource", "programming"],
    keywords: ["tech", "technology", "programming", "developer", "software", "opensource", "linux"],
    query: "technology programming opensource software",
  },
  {
    id: "science",
    icon: "bulb-line",
    tags: ["science", "research", "astronomy"],
    keywords: ["science", "scientist", "research", "physics", "biology", "astronomy", "space"],
    query: "science research physics astronomy",
  },
  {
    id: "news",
    icon: "news-line",
    tags: ["news", "politics", "journalism"],
    keywords: ["news", "journalism", "journalist", "politics", "policy", "world"],
    query: "news journalism politics",
  },
  {
    id: "nature",
    icon: "planet-line",
    tags: ["nature", "climate", "environment"],
    keywords: ["nature", "environment", "climate", "sustainability", "wildlife", "ecology"],
    query: "nature environment climate wildlife",
  },
  {
    id: "photography",
    icon: "photo-album-line",
    tags: ["photography", "photographer", "photo"],
    keywords: ["photography", "photographer", "photo", "camera", "landscape"],
    query: "photography photographer camera",
  },
  {
    id: "gaming",
    icon: "play-line",
    tags: ["gaming", "videogames", "indiegames"],
    keywords: ["game", "games", "gaming", "videogames", "indie", "developer"],
    query: "gaming videogames indie games",
  },
  {
    id: "health",
    icon: "heart-line",
    tags: ["health", "mentalhealth", "wellbeing"],
    keywords: ["health", "wellbeing", "mentalhealth", "fitness", "medicine", "care"],
    query: "health wellbeing mentalhealth fitness",
  },
  {
    id: "travel",
    icon: "globe-line",
    tags: ["travel", "hiking", "outdoors"],
    keywords: ["travel", "traveller", "traveler", "hiking", "outdoors", "adventure"],
    query: "travel hiking outdoors adventure",
  },
  {
    id: "communities",
    icon: "group-line",
    tags: ["lgbtq", "queer", "accessibility"],
    keywords: ["lgbtq", "queer", "trans", "accessibility", "neurodiversity", "community"],
    query: "lgbtq queer accessibility community",
  },
] as const satisfies readonly DiscoverCategory[];

export type DiscoverCategoryId = (typeof DISCOVER_CATEGORIES)[number]["id"];

export interface DiscoverCandidate {
  account: Account;
  /** How many recent posts from category hashtags this account authored. */
  tagHits: number;
  /** Whether the account API search matched this category query. */
  searchHits: number;
  lastSeen: number;
}

interface CacheEntry {
  at: number;
  accounts: Account[];
}

const CACHE_TTL = 30 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<Account[]>>();

export function clearDiscoverCache(): void {
  cache.clear();
  pending.clear();
}

function candidateFor(map: Map<string, DiscoverCandidate>, account: Account): DiscoverCandidate {
  let candidate = map.get(account.id);
  if (!candidate) {
    candidate = { account, tagHits: 0, searchHits: 0, lastSeen: 0 };
    map.set(account.id, candidate);
  } else {
    candidate.account = account;
  }
  return candidate;
}

function isUnavailable(account: Account): boolean {
  return (account as Account & { suspended?: boolean }).suspended === true;
}

/** Higher is more relevant for the category. Exported for unit tests. */
export function scoreDiscoverCandidate(
  candidate: DiscoverCandidate,
  category: DiscoverCategory,
  now = Date.now(),
): number {
  const { account } = candidate;
  const text =
    `${account.displayName} ${account.username} ${htmlToPlainText(account.note)}`.toLowerCase();
  const tokens = new Set(text.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const keywordHits = category.keywords.filter((keyword) => tokens.has(keyword)).length;
  const recency = candidate.lastSeen
    ? Math.max(0, 1 - (now - candidate.lastSeen) / (30 * 24 * 60 * 60 * 1000))
    : 0;
  return (
    candidate.searchHits * 25 +
    Math.min(candidate.tagHits, 6) * 12 +
    Math.min(keywordHits, 6) * 10 +
    Math.log10(account.followersCount + 1) * 4 +
    Math.log10(account.statusesCount + 1) * 2 +
    recency * 8
  );
}

export function rankDiscoverCandidates(
  candidates: readonly DiscoverCandidate[],
  category: DiscoverCategory,
  now = Date.now(),
  limit = 15,
): Account[] {
  return [...candidates]
    .sort((a, b) => {
      const delta =
        scoreDiscoverCandidate(b, category, now) - scoreDiscoverCandidate(a, category, now);
      if (delta !== 0) return delta;
      if (b.account.followersCount !== a.account.followersCount) {
        return b.account.followersCount - a.account.followersCount;
      }
      return a.account.acct.localeCompare(b.account.acct);
    })
    .slice(0, limit)
    .map((candidate) => candidate.account);
}

async function loadDiscoverAccounts(
  client: RestClient,
  category: DiscoverCategory,
  viewerId: string | undefined,
  now: number,
): Promise<Account[]> {
  const requests = [
    client.v2.search
      .list({ q: category.query, resolve: true, type: "accounts", limit: 20 })
      .then((result) => ({ type: "search" as const, result })),
    ...category.tags.map((tag) =>
      client.v1.timelines.tag
        .$select(tag)
        .list({ limit: 20 })
        .then((result) => ({ type: "tag" as const, result })),
    ),
  ];
  const settled = await Promise.allSettled(requests);
  const candidates = new Map<string, DiscoverCandidate>();
  let failed = 0;

  for (const entry of settled) {
    if (entry.status === "rejected") {
      failed += 1;
      continue;
    }
    if (entry.value.type === "search") {
      for (const account of entry.value.result.accounts) {
        if (isUnavailable(account)) continue;
        candidateFor(candidates, account).searchHits += 1;
      }
    } else {
      for (const status of entry.value.result as Status[]) {
        const author = status.reblog?.account ?? status.account;
        if (!author || isUnavailable(author)) continue;
        const candidate = candidateFor(candidates, author);
        candidate.tagHits += 1;
        const createdAt = Date.parse(status.createdAt);
        if (Number.isFinite(createdAt)) {
          candidate.lastSeen = Math.max(candidate.lastSeen, createdAt);
        }
      }
    }
  }

  if (failed === settled.length) {
    throw new Error("discover_failed");
  }

  const filtered = [...candidates.values()].filter(
    (candidate) => candidate.account.id !== viewerId,
  );
  return rankDiscoverCandidates(filtered, category, now);
}

/** Fetches a category directory, reusing an in-memory cache per instance. */
export async function discoverAccounts(
  client: RestClient,
  instance: string,
  category: DiscoverCategory,
  viewerId?: string,
  now = Date.now(),
): Promise<Account[]> {
  const key = `${instance}:${viewerId ?? ""}:${category.id}`;
  const cached = cache.get(key);
  if (cached && now - cached.at < CACHE_TTL) return cached.accounts;
  const existing = pending.get(key);
  if (existing) return existing;

  const promise = loadDiscoverAccounts(client, category, viewerId, now);
  pending.set(key, promise);
  try {
    const accounts = await promise;
    cache.set(key, { at: now, accounts });
    return accounts;
  } finally {
    pending.delete(key);
  }
}
