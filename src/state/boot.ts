import {
  buildAuthorizeUrl,
  exchangeCode,
  makeChallenge,
  makeState,
  makeVerifier,
  PENDING_AUTH_KEY,
  registerApp,
  revokeToken,
  supportsPKCE,
  type PendingAuth,
} from "../api/auth";
import { connectUserStream, getRest, getInstanceInfo } from "../api/client";
import type {
  AccentSetting,
  AccountMeta,
  CleanupCursor,
  CleanupPolicy,
  FloatRect,
  NewsletterSource,
  Shortcut,
  Status,
} from "../api/types";
import { t } from "../i18n/pt-BR";
import { authRedirect } from "../lib/auth-route";
import { setFormatLocale } from "../lib/format";
import { sanitizeSettings } from "../lib/backup";
import {
  CLEANUP_INTERVAL_MS,
  cleanupCooldownActive,
  cleanupCooldownUntil,
  cleanupDue,
  cleanupPolicyWidened,
  normalizeCleanupPolicy,
  runCleanup,
} from "../lib/cleanup";
import { clampWidth } from "../lib/layout";
import { updatePanelColor, type PanelColor } from "../lib/panel-colors";
import { navigate, parseHash } from "../lib/router";
import {
  migrateLegacyStorage,
  readJSON,
  sessionRead,
  sessionRemove,
  sessionWrite,
  writeJSON,
} from "../lib/storage";
import {
  accountNS,
  currentAccount,
  pushHomeQueue,
  pushNotification,
  putStatus,
  putStatuses,
  removeStatusById,
  store,
  toast,
  type AccountPrefs,
  type AppState,
} from "./store";

function defaultShortcuts(): Shortcut[] {
  return [
    { id: "home", type: "home", label: t.home },
    { id: "notifications", type: "notifications", label: t.notifications },
    { id: "local", type: "local", label: t.local },
  ];
}

let disconnectStream: (() => void) | null = null;

/* ---------- persistence ---------- */

function saveAccounts(): void {
  writeJSON("accounts", store.accounts);
}

function saveCurrentAccountId(): void {
  writeJSON("currentAccount", store.currentAccountId);
}

export function saveSettings(): void {
  writeJSON("settings", store.settings);
  applyAppearance();
}

function savePrefs(): void {
  writeJSON("prefs", store.prefs);
}

export function applyAppearance(): void {
  const root = document.documentElement;
  root.dataset["theme"] = store.settings.theme;
  root.dataset["accent"] = store.settings.accent;
  root.dataset["font"] = store.settings.fontFamily;
  root.dataset["textDark"] = store.settings.textColorDark;
  root.dataset["textLight"] = store.settings.textColorLight;
  root.lang = store.settings.language;
  root.style.setProperty("--text-size", `${store.settings.textSize}px`);
  setFormatLocale(store.settings.language);
  applyFavicon();
}

const ACCENT_HEX: Record<AccentSetting, string> = {
  green: "#3ddc97",
  orange: "#f59e0b",
  purple: "#a78bfa",
  blue: "#60a5fa",
  pink: "#f472b6",
};

function applyFavicon(): void {
  const color = ACCENT_HEX[store.settings.accent] ?? ACCENT_HEX.green;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="16" fill="#0a0e13"/>` +
    `<circle cx="32" cy="34" r="17" fill="none" stroke="${color}" stroke-width="7"/>` +
    `<circle cx="32" cy="17" r="8" fill="${color}"/></svg>`;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/* ---------- account ---------- */

export function resolveShortcuts(): void {
  const account = currentAccount();
  if (!account) {
    store.shortcuts = [];
    return;
  }
  const prefs = store.prefs[accountNS(account)];
  store.shortcuts = prefs?.shortcuts?.length
    ? prefs.shortcuts
    : defaultShortcuts().map((s) => ({ ...s }));
}

function updatePrefsFor(account: AccountMeta, patch: Partial<AccountPrefs>): void {
  const ns = accountNS(account);
  store.prefs[ns] = { ...(store.prefs[ns] ?? { shortcuts: [] }), ...patch };
  savePrefs();
}

/** Single writer for the current account's prefs (one field per caller). */
function updatePrefs(patch: Partial<AccountPrefs>): void {
  const account = currentAccount();
  if (!account) return;
  updatePrefsFor(account, patch);
}

export function saveCleanupPolicy(policy: CleanupPolicy): void {
  const account = currentAccount();
  if (!account) return;
  const stored = store.prefs[accountNS(account)]?.cleanup;
  const previous = stored ? normalizeCleanupPolicy(stored) : undefined;
  const next = normalizeCleanupPolicy(policy);
  const patch: Partial<AccountPrefs> = { cleanup: next };
  const widened = !!previous && cleanupPolicyWidened(previous, next);
  const ageWidened = !!previous && next.minStatusAge < previous.minStatusAge;
  if (widened) {
    patch.cleanupCursor = undefined;
    patch.cleanupInspectedThrough = 0;
  } else if (ageWidened) {
    patch.cleanupCursor = undefined;
  }
  updatePrefs(patch);
  if (next.enabled && (!previous?.enabled || widened || ageWidened)) {
    scheduleCleanup(account, 1000);
  }
}

export function saveCleanupRunFor(
  account: AccountMeta,
  lastRun: number,
  rateLimitedUntil: number,
  cursor: CleanupCursor | undefined,
  inspectedThrough: number | undefined,
  resumePending: boolean,
): void {
  updatePrefsFor(account, {
    cleanupLastRun: lastRun,
    cleanupRateLimitedUntil: rateLimitedUntil,
    cleanupCursor: cursor,
    cleanupInspectedThrough: inspectedThrough,
    cleanupResumePending: resumePending,
  });
}

/** Keep read-only continuation well below the API's general rate limit. */
const CLEANUP_SCAN_RETRY_MS = 2 * 60 * 1000;
let cleanupTimer: number | null = null;
const cleanupInFlight = new Set<string>();

function clearCleanupTimer(): void {
  if (cleanupTimer !== null) {
    window.clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
}

function scheduleCleanup(account: AccountMeta, delay: number): void {
  if (currentAccount()?.id !== account.id) return;
  clearCleanupTimer();
  cleanupTimer = window.setTimeout(
    () => {
      cleanupTimer = null;
      const current = currentAccount();
      if (!current || current.id !== account.id) return;
      void runCleanupBatch(current, false);
    },
    Math.max(1000, delay),
  );
}

async function runCleanupBatch(account: AccountMeta, dueOnly: boolean): Promise<void> {
  if (cleanupInFlight.has(account.id)) return;
  clearCleanupTimer();
  const prefs = store.prefs[accountNS(account)];
  const policy = normalizeCleanupPolicy(prefs?.cleanup);
  if (!policy.enabled) return;

  const hasPending = !!prefs?.cleanupCursor || !!prefs?.cleanupResumePending;
  const cooldown = prefs?.cleanupRateLimitedUntil;
  if (dueOnly && !hasPending && !cleanupCooldownActive(cooldown)) {
    if (!cleanupDue(policy, prefs?.cleanupLastRun)) {
      scheduleCleanup(account, (prefs?.cleanupLastRun ?? 0) + CLEANUP_INTERVAL_MS - Date.now());
      return;
    }
  }
  if (cleanupCooldownActive(cooldown)) {
    scheduleCleanup(account, (cooldown ?? 0) - Date.now() + 1000);
    return;
  }

  cleanupInFlight.add(account.id);
  try {
    const result = await runCleanup({
      client: getRest(account.instance, account.accessToken),
      accountId: account.id,
      policy,
      state: {
        cursor: prefs?.cleanupCursor,
        inspectedThrough: prefs?.cleanupInspectedThrough,
      },
      onDeleted: (status) => removeStatusById(account.instance, status.id),
    });
    const at = Date.now();
    const until = cleanupCooldownUntil(result, at);
    saveCleanupRunFor(
      account,
      at,
      until,
      result.cursor,
      result.inspectedThrough,
      !!(result.cursor || result.rateLimited),
    );
    if (result.deleted > 0) store.ui.feedsRevision += 1;
    if (result.rateLimited) {
      toast(t.cleanupRateLimited, "error");
    } else if (result.deleted > 0) {
      const wait = result.cursor ? ` · ${t.cleanupBatchWait}` : "";
      toast(`${t.cleanupDeletedPosts}: ${result.deleted}${wait}`, "ok");
    }
    if (result.cursor || result.rateLimited) {
      scheduleCleanup(account, until > at ? until - at + 1000 : CLEANUP_SCAN_RETRY_MS);
    } else {
      scheduleCleanup(account, CLEANUP_INTERVAL_MS);
    }
  } catch (err) {
    console.warn("[oltn] automated cleanup failed", err);
    scheduleCleanup(account, CLEANUP_INTERVAL_MS);
  } finally {
    cleanupInFlight.delete(account.id);
  }
}

export function saveShortcuts(shortcuts: Shortcut[]): void {
  store.shortcuts = shortcuts;
  updatePrefs({ shortcuts });
}

/** Replaces the current account preferences (backup import). */
export function replacePrefs(prefs: AccountPrefs): void {
  const account = currentAccount();
  if (!account) return;
  store.prefs[accountNS(account)] = { ...prefs };
  savePrefs();
  resolveShortcuts();
}

export function saveColumnLayout(order: readonly string[], widths: Record<string, number>): void {
  updatePrefs({ columnOrder: [...order], columnWidths: { ...widths } });
}

export function saveFloatLayout(
  rects: Readonly<Record<string, FloatRect>>,
  order: readonly string[],
): void {
  updatePrefs({ floats: { ...rects }, floatOrder: [...order] });
}

export function savePanelColor(id: string, color: PanelColor | ""): void {
  const account = currentAccount();
  if (!account) return;
  const prev = store.prefs[accountNS(account)];
  updatePrefs({ colors: updatePanelColor(prev?.colors ?? {}, id, color) });
}

export function saveNewsletterSources(
  sources: readonly NewsletterSource[],
  version?: number,
): void {
  updatePrefs({
    newsletterSources: [...sources],
    ...(version === undefined ? {} : { newsletterSourcesVersion: version }),
  });
}

export function saveNewsletterSourcesVersion(version: number): void {
  updatePrefs({ newsletterSourcesVersion: version });
}

export function saveTimeseriesLastAt(at: number): void {
  updatePrefs({ timeseriesLastAt: at });
}

export function resetColumnLayout(): void {
  const account = currentAccount();
  if (!account) return;
  const ns = accountNS(account);
  const prev = store.prefs[ns];
  store.prefs[ns] = { shortcuts: prev?.shortcuts ?? [] };
  savePrefs();
}

export function addAccount(account: AccountMeta): void {
  store.accounts = [...store.accounts.filter((a) => a.id !== account.id), account];
  saveAccounts();
  store.currentAccountId = account.id;
  saveCurrentAccountId();
}

export function removeAccount(id: string): void {
  store.accounts = store.accounts.filter((a) => a.id !== id);
  saveAccounts();
  if (store.currentAccountId === id) {
    store.currentAccountId = store.accounts[0]?.id ?? null;
    saveCurrentAccountId();
  }
}

/** Refreshes the current account's public data (after editing the profile). */
export function updateCurrentAccountMeta(
  patch: Partial<Pick<AccountMeta, "displayName" | "avatar" | "handle">>,
): void {
  const account = currentAccount();
  if (!account) return;
  const updated: AccountMeta = { ...account, ...patch };
  store.accounts = store.accounts.map((a) => (a.id === account.id ? updated : a));
  saveAccounts();
}

export async function signIn(account: AccountMeta): Promise<void> {
  store.auth = "loading";
  store.currentAccountId = account.id;
  saveCurrentAccountId();
  resolveShortcuts();
  try {
    const client = getRest(account.instance, account.accessToken);
    const [me, instance] = await Promise.all([
      client.v1.accounts.verifyCredentials(),
      getInstanceInfo(account.instance),
    ]);
    store.me = me;
    store.instance = instance;
    store.auth = "authenticated";
    void runCleanupBatch(account, true);
    if (store.settings.autoStream) {
      connectStream(account, instance.streamingApi ?? null);
    } else {
      store.stream = "off";
    }
  } catch (err) {
    console.warn("[oltn] signIn failed", err);
    store.me = null;
    store.auth = "anonymous";
    if (parseHash().path !== "/login") navigate("/login", { replace: true });
  }
}

export function switchAccount(id: string): void {
  const account = store.accounts.find((a) => a.id === id);
  if (!account) return;
  store.currentAccountId = id;
  saveCurrentAccountId();
  // Account-scoped state (me, instance, streams, prefs) is rebuilt by boot.
  location.hash = "#/";
  location.reload();
}

export async function signOut(): Promise<void> {
  clearCleanupTimer();
  const account = currentAccount();
  disconnectStream?.();
  disconnectStream = null;
  store.stream = "off";
  if (account) {
    void revokeToken({
      instance: account.instance,
      clientId: account.clientId,
      clientSecret: account.clientSecret,
      token: account.accessToken,
    });
    store.accounts = store.accounts.filter((a) => a.id !== account.id);
    saveAccounts();
    const next = store.accounts[0] ?? null;
    store.currentAccountId = next?.id ?? null;
    saveCurrentAccountId();
    if (next) {
      location.hash = "#/";
      location.reload();
      return;
    }
  }
  store.me = null;
  store.instance = null;
  store.shortcuts = [];
  store.auth = "anonymous";
  navigate("/login", { replace: true });
}

/** Reauthorizes the current account with the push scope, keeping its prefs. */
export async function beginAccountReconnect(account: AccountMeta): Promise<void> {
  const app = await registerApp(account.instance);
  const pkce = await supportsPKCE(account.instance);
  const pending: PendingAuth = {
    instance: account.instance,
    clientId: app.clientId,
    clientSecret: app.clientSecret,
    pkce,
    state: makeState(),
    redirectAfter: "/settings",
    reconnectAccountId: account.id,
  };
  if (pkce) {
    const verifier = makeVerifier();
    pending.codeVerifier = verifier;
    const challenge = await makeChallenge(verifier);
    sessionWrite(PENDING_AUTH_KEY, pending);
    window.location.assign(
      buildAuthorizeUrl({
        instance: account.instance,
        clientId: app.clientId,
        pkce: true,
        codeChallenge: challenge,
        state: pending.state,
      }),
    );
    return;
  }
  sessionWrite(PENDING_AUTH_KEY, pending);
  window.location.assign(
    buildAuthorizeUrl({
      instance: account.instance,
      clientId: app.clientId,
      state: pending.state,
    }),
  );
}

/* ---------- stream ---------- */

/** Connects or disconnects the stream based on the auto-update preference. */
export function syncStream(): void {
  const account = currentAccount();
  if (!account || store.auth !== "authenticated") return;
  if (store.settings.autoStream) {
    if (store.stream === "off" || !disconnectStream) {
      connectStream(account, store.instance?.streamingApi ?? null);
    }
  } else if (disconnectStream || store.stream !== "off") {
    disconnectStream?.();
    disconnectStream = null;
    store.stream = "off";
  }
}

function connectStream(account: AccountMeta, streamingApi: string | null): void {
  disconnectStream?.();
  store.stream = "connecting";
  disconnectStream = connectUserStream({
    instance: account.instance,
    accessToken: account.accessToken,
    streamingApi,
    handlers: {
      onOpen: () => {
        store.stream = "on";
      },
      onClose: () => {
        store.stream = "off";
      },
      onUpdate: (status: Status) => {
        putStatuses([status], account.instance);
        pushHomeQueue(putStatus(status, account.instance));
        // Own boosts can arrive from another client; refresh boosts feeds.
        if (status.reblog && status.account.id === store.me?.id) {
          store.ui.boostsRevision += 1;
        }
      },
      onNotification: (notification) => {
        if (notification.status) putStatuses([notification.status], account.instance);
        pushNotification(notification);
      },
      onStatusUpdate: (status) => {
        putStatus(status, account.instance);
      },
      onDelete: (id: string) => {
        // Unboosting elsewhere deletes my boost wrapper; refresh boosts feeds.
        const removed = Object.values(store.statuses).find((status) => status.id === id);
        if (removed?.reblog && removed.account.id === store.me?.id) {
          store.ui.boostsRevision += 1;
        }
        removeStatusById(account.instance, id);
      },
    },
  });
}

/* ---------- callback OAuth ---------- */

async function handleOAuthCallback(code: string, state?: string): Promise<boolean> {
  // Popup: forwards the code to the main window and closes.
  if (window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage({ type: "oltn-oauth", code, state }, location.origin);
    } catch (err) {
      console.warn("[oltn] oauth relay failed", err);
    }
    document.body.innerHTML = `<div style="display:grid;place-items:center;height:100vh;font-family:system-ui">${t.loginDone}</div>`;
    window.setTimeout(() => window.close(), 400);
    return true;
  }

  const pending = sessionRead<PendingAuth | null>(PENDING_AUTH_KEY, null);
  sessionRemove(PENDING_AUTH_KEY);
  if (!pending) return false;
  if (pending.state && state !== pending.state) {
    console.warn("[oltn] oauth state mismatch");
    return false;
  }
  try {
    const { accessToken } = await exchangeCode({
      instance: pending.instance,
      clientId: pending.clientId,
      clientSecret: pending.clientSecret,
      code,
      codeVerifier: pending.codeVerifier,
    });
    const client = getRest(pending.instance, accessToken);
    const me = await client.v1.accounts.verifyCredentials();
    if (pending.reconnectAccountId && me.id !== pending.reconnectAccountId) {
      throw new Error("oauth_account_mismatch");
    }
    const previous = pending.reconnectAccountId
      ? store.accounts.find((item) => item.id === pending.reconnectAccountId)
      : null;
    const account: AccountMeta = {
      id: me.id,
      instance: pending.instance,
      handle: me.acct.includes("@") ? me.acct : `${me.acct}@${pending.instance}`,
      displayName: me.displayName || me.username,
      avatar: me.avatar,
      accessToken,
      clientId: pending.clientId,
      clientSecret: pending.clientSecret,
      createdAt: previous?.createdAt ?? Date.now(),
    };
    addAccount(account);
    await signIn(account);
    if (store.auth !== "authenticated") return false;
    if (previous && previous.accessToken !== accessToken) {
      void revokeToken({
        instance: previous.instance,
        clientId: previous.clientId,
        clientSecret: previous.clientSecret,
        token: previous.accessToken,
      });
    }
    navigate(
      pending.redirectAfter && !pending.redirectAfter.startsWith("/login")
        ? pending.redirectAfter
        : "/",
      { replace: true },
    );
    return true;
  } catch (err) {
    console.warn("[oltn] oauth exchange failed", err);
    return false;
  }
}

/* ---------- boot ---------- */

export async function boot(): Promise<void> {
  migrateLegacyStorage();

  // 1. persisted state
  store.accounts = readJSON<AccountMeta[]>("accounts", []);
  store.currentAccountId = readJSON<string | null>("currentAccount", null);
  const storedSettings = readJSON<Record<string, unknown>>("settings", {});
  store.settings = sanitizeSettings(storedSettings);
  const storedPrefs = readJSON<AppState["prefs"]>("prefs", {});
  for (const scope of Object.values(storedPrefs)) {
    if (!scope.columnWidths) continue;
    for (const [id, width] of Object.entries(scope.columnWidths)) {
      scope.columnWidths[id] = clampWidth(width);
    }
  }
  store.prefs = storedPrefs;
  applyAppearance();

  // 2. oauth callback (?code= may be in search or hash)
  const search = new URLSearchParams(location.search);
  const hashQuery = new URLSearchParams(location.hash.split("?")[1] ?? "");
  const code = search.get("code") ?? hashQuery.get("code");
  const oauthState = search.get("state") ?? hashQuery.get("state");
  if (code) {
    const handled = await handleOAuthCallback(code, oauthState ?? undefined);
    if (handled && window.opener) {
      store.booted = true;
      return;
    }
    history.replaceState(null, "", location.pathname + location.hash);
    if (handled) {
      // The callback already initialized the account; do not sign in twice.
      store.booted = true;
      const { path } = parseHash();
      const redirect = authRedirect(path, store.auth);
      if (redirect) navigate(redirect, { replace: true });
      return;
    }
  }

  // 3. session
  const account = currentAccount() ?? store.accounts[0] ?? null;
  if (account) {
    await signIn(account);
  } else {
    store.auth = "anonymous";
  }

  store.booted = true;

  // 4. route guard
  const { path } = parseHash();
  const redirect = authRedirect(path, store.auth);
  if (redirect) navigate(redirect, { replace: true });
}
