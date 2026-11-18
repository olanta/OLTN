/* Local automated post deletion. The policy lives with the account prefs and
   runs on sign-in, so it works on any static deployment without a backend.
   The API only exposes deletion, so this mirrors Mastodon's policy semantics
   and keeps a local inspection cursor instead of the server-side scheduler. */

import type { CleanupCursor, CleanupPolicy, RestClient, Status } from "../api/types";
import { httpStatusOf } from "./errors";

/** The age thresholds offered by Mastodon's server-side cleanup policy. */
export const CLEANUP_MIN_AGE_SECONDS = [
  604800, 1209600, 2629746, 5259492, 7889238, 15778476, 31556952, 63113904,
] as const;

export const DEFAULT_CLEANUP_POLICY: CleanupPolicy = {
  enabled: false,
  minStatusAge: 1209600,
  keepPinned: true,
  keepDirect: true,
  keepFavourited: true,
  keepBookmarked: true,
  keepPolls: false,
  keepMedia: false,
  minFavourites: 0,
  minBoosts: 0,
};

export const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Mastodon allows 30 status deletions per 30 minutes per account. */
export const CLEANUP_MAX_DELETES = 30;
export const CLEANUP_RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;

const PAGE_SIZE = 40;
const MAX_PAGES = 50;
const DELETE_DELAY_MS = 900;
const PAGE_DELAY_MS = 250;

function nearestMinAge(seconds: number): number {
  let nearest: number = CLEANUP_MIN_AGE_SECONDS[0];
  for (const option of CLEANUP_MIN_AGE_SECONDS) {
    if (Math.abs(option - seconds) < Math.abs(nearest - seconds)) nearest = option;
  }
  return nearest;
}

function thresholdOf(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return 0;
  return Math.min(1_000_000, Math.round(value));
}

export function normalizeCleanupPolicy(value: unknown): CleanupPolicy {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const bool = (key: keyof CleanupPolicy, fallback: boolean): boolean =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : fallback;

  let minStatusAge = DEFAULT_CLEANUP_POLICY.minStatusAge;
  if (
    typeof raw.minStatusAge === "number" &&
    Number.isFinite(raw.minStatusAge) &&
    raw.minStatusAge > 0
  ) {
    minStatusAge = nearestMinAge(raw.minStatusAge);
  } else if (typeof raw.ageDays === "number" && Number.isFinite(raw.ageDays) && raw.ageDays > 0) {
    // Migrate the first local shape of the policy.
    minStatusAge = nearestMinAge(raw.ageDays * 24 * 60 * 60);
  }

  return {
    enabled: bool("enabled", DEFAULT_CLEANUP_POLICY.enabled),
    minStatusAge,
    keepPinned: bool("keepPinned", DEFAULT_CLEANUP_POLICY.keepPinned),
    keepDirect: bool("keepDirect", DEFAULT_CLEANUP_POLICY.keepDirect),
    keepFavourited: bool("keepFavourited", DEFAULT_CLEANUP_POLICY.keepFavourited),
    keepBookmarked: bool("keepBookmarked", DEFAULT_CLEANUP_POLICY.keepBookmarked),
    keepPolls: bool("keepPolls", DEFAULT_CLEANUP_POLICY.keepPolls),
    keepMedia: bool("keepMedia", DEFAULT_CLEANUP_POLICY.keepMedia),
    minFavourites: thresholdOf(raw.minFavourites),
    minBoosts: thresholdOf(raw.minBoosts),
  };
}

/** True when the post is older than the policy and matches no exception. */
export function shouldDeleteStatus(status: Status, policy: CleanupPolicy, cutoff: number): boolean {
  const createdAt = Date.parse(status.createdAt);
  if (!Number.isFinite(createdAt) || createdAt >= cutoff) return false;
  if (policy.keepPinned && status.pinned) return false;
  if (policy.keepDirect && status.visibility === "direct") return false;
  if (policy.keepFavourited && status.favourited) return false;
  if (policy.keepBookmarked && status.bookmarked) return false;
  if (policy.keepPolls && status.poll) return false;
  if (policy.keepMedia && (status.mediaAttachments?.length ?? 0) > 0) return false;
  if (policy.minFavourites > 0 && (status.favouritesCount ?? 0) >= policy.minFavourites)
    return false;
  if (policy.minBoosts > 0 && (status.reblogsCount ?? 0) >= policy.minBoosts) return false;
  return true;
}

export function cleanupDue(
  policy: CleanupPolicy | undefined,
  lastRun: number | undefined,
  now = Date.now(),
): boolean {
  return !!policy?.enabled && (!lastRun || now - lastRun >= CLEANUP_INTERVAL_MS);
}

export function cleanupCooldownActive(
  rateLimitedUntil: number | undefined,
  now = Date.now(),
): boolean {
  return !!rateLimitedUntil && now < rateLimitedUntil;
}

/** A full 30-post batch or a 429 means the next batch must wait. */
export function cleanupCooldownUntil(result: CleanupResult, at = Date.now()): number {
  return result.rateLimited || result.deleted >= CLEANUP_MAX_DELETES
    ? at + CLEANUP_RATE_LIMIT_COOLDOWN_MS
    : 0;
}

/** Matches Mastodon's cursor invalidation when the policy is widened. */
export function cleanupPolicyWidened(previous: CleanupPolicy, next: CleanupPolicy): boolean {
  const keepKeys = [
    "keepPinned",
    "keepDirect",
    "keepFavourited",
    "keepBookmarked",
    "keepPolls",
    "keepMedia",
  ] as const;
  if (keepKeys.some((key) => previous[key] && !next[key])) return true;
  const thresholdWidened = (before: number, after: number): boolean =>
    before > 0 && (after === 0 || after > before);
  return (
    thresholdWidened(previous.minFavourites, next.minFavourites) ||
    thresholdWidened(previous.minBoosts, next.minBoosts)
  );
}

export interface CleanupResult {
  scanned: number;
  deleted: number;
  failed: number;
  kept: number;
  /** Stopped because of the delete budget, a rate limit, or the scan budget. */
  stopped: boolean;
  /** Mastodon rejected a deletion with a 429 response. */
  rateLimited: boolean;
  /** Resume point when the pass did not finish. */
  cursor?: CleanupCursor;
  /** New completed-pass boundary, when the pass reached the end. */
  inspectedThrough?: number;
}

export interface CleanupState {
  cursor?: CleanupCursor;
  inspectedThrough?: number;
}

export interface CleanupOptions {
  client: RestClient;
  accountId: string;
  policy: CleanupPolicy;
  state?: CleanupState;
  maxDeletes?: number;
  now?: number;
  /** Test seam; the UI uses the default pause between deletions. */
  sleep?: (ms: number) => Promise<void>;
  onDeleted?: (status: Status) => void;
  onProgress?: (result: CleanupResult) => void;
}

const deleteDelay = (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 900));

/**
 * Deletes eligible posts newest to oldest in resumable passes. The statuses API
 * only pages newest-first, so the cursor records the last inspected status and
 * the pass boundaries instead of re-walking the whole account every time.
 */
export async function runCleanup({
  client,
  accountId,
  policy,
  state,
  maxDeletes = CLEANUP_MAX_DELETES,
  now = Date.now(),
  sleep = deleteDelay,
  onDeleted,
  onProgress,
}: CleanupOptions): Promise<CleanupResult> {
  const storedCursor = state?.cursor;
  const completedThrough = state?.inspectedThrough ?? 0;
  const floor = storedCursor?.floor ?? completedThrough;
  const passCutoff = storedCursor?.cutoff ?? now - policy.minStatusAge * 1000;
  const result: CleanupResult = {
    scanned: 0,
    deleted: 0,
    failed: 0,
    kept: 0,
    stopped: false,
    rateLimited: false,
  };

  if (passCutoff <= floor) {
    result.inspectedThrough = floor;
    return result;
  }

  let maxId = storedCursor?.maxId;
  let lastInspectedId: string | undefined;
  let completed = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const statuses = await client.v1.accounts.$select(accountId).statuses.list({
      limit: PAGE_SIZE,
      maxId,
    });
    if (!statuses.length) {
      completed = true;
      break;
    }

    for (const status of statuses) {
      if (result.deleted >= maxDeletes) {
        result.stopped = true;
        break;
      }
      const createdAt = Date.parse(status.createdAt);
      if (Number.isFinite(createdAt) && createdAt < floor) {
        completed = true;
        break;
      }
      if (!Number.isFinite(createdAt) || createdAt > passCutoff) {
        lastInspectedId = status.id;
        continue;
      }

      result.scanned += 1;
      if (!shouldDeleteStatus(status, policy, passCutoff)) {
        result.kept += 1;
        lastInspectedId = status.id;
        continue;
      }

      try {
        await client.v1.statuses.$select(status.id).remove();
        result.deleted += 1;
        lastInspectedId = status.id;
        onDeleted?.(status);
        await sleep(DELETE_DELAY_MS);
      } catch (err) {
        const httpStatus = httpStatusOf(err);
        if (httpStatus === 401 || httpStatus === 403) throw err;
        if (httpStatus === 429) {
          result.stopped = true;
          result.rateLimited = true;
          result.failed += 1;
          onProgress?.(result);
          return finish(result, completedThrough, floor, passCutoff, lastInspectedId, maxId);
        }
        result.failed += 1;
        lastInspectedId = status.id;
      }
      onProgress?.(result);
    }

    if (completed || result.stopped) break;
    if (statuses.length < PAGE_SIZE) {
      completed = true;
      break;
    }
    const last = statuses[statuses.length - 1];
    if (!last) {
      completed = true;
      break;
    }
    maxId = last.id;
    if (page === MAX_PAGES - 1) {
      result.stopped = true;
      break;
    }
    await sleep(PAGE_DELAY_MS);
  }

  onProgress?.(result);
  return finish(result, completedThrough, floor, passCutoff, lastInspectedId, maxId);
}

function finish(
  result: CleanupResult,
  completedThrough: number,
  floor: number,
  passCutoff: number,
  lastInspectedId: string | undefined,
  maxId: string | undefined,
): CleanupResult {
  if (!result.stopped) {
    result.cursor = undefined;
    result.inspectedThrough = Math.max(floor, passCutoff);
    return result;
  }
  const resumeId = lastInspectedId ?? maxId;
  if (resumeId) {
    result.cursor = { maxId: resumeId, cutoff: passCutoff, floor };
    result.inspectedThrough = completedThrough || undefined;
  }
  return result;
}
