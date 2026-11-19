/* Resolves curated handles to local accounts for avatars and display names.
   Searches are cached and concurrency-limited so a long language seed list
   does not flood the instance API. */

import type { Account, RestClient } from "../api/types";
import { resolveAccountHandle } from "./identity";

const LIMIT = 4;
const cache = new Map<string, Account | null>();
const pending = new Map<string, Promise<Account | null>>();
let active = 0;
const queue: (() => void)[] = [];

function acquire(): Promise<void> {
  if (active < LIMIT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release(): void {
  active -= 1;
  queue.shift()?.();
}

export function resolveSeedAccount(
  client: RestClient,
  instance: string,
  handle: string,
): Promise<Account | null> {
  const key = `${instance}|${handle.toLowerCase()}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);
  const existing = pending.get(key);
  if (existing) return existing;

  const promise = (async () => {
    await acquire();
    try {
      const account = await resolveAccountHandle(client, handle);
      cache.set(key, account);
      return account;
    } catch {
      cache.set(key, null);
      return null;
    } finally {
      release();
    }
  })();

  pending.set(key, promise);
  void promise.finally(() => pending.delete(key));
  return promise;
}
