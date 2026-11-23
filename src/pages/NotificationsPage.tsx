import type { JSX } from "preact";
import { t } from "../i18n/pt-BR";
import { navigate, useRouter } from "../lib/router";
import { GroupedNotificationsFeed } from "../components/feed/GroupedNotificationsFeed";
import { NotificationsFeed } from "../components/feed/NotificationsFeed";
import { Icon } from "../components/ui/Icon";
import { PageShell } from "../components/ui/PageShell";
import { currentAccount } from "../state/store";

export function NotificationsPage({
  mode,
}: {
  mode?: "all" | "grouped" | "mentions";
}): JSX.Element {
  const account = currentAccount();
  const route = useRouter();
  const active =
    mode ??
    (route.path === "/mentions"
      ? "mentions"
      : route.path === "/notifications/grouped"
        ? "grouped"
        : "all");

  if (!account) {
    return (
      <PageShell title={t.notifications}>
        <div class="center-state">
          <Icon name="notification-line" size={28} />
          <h3>{t.loginSubtitle}</h3>
          <button type="button" class="btn primary" onClick={() => navigate("/login")}>
            {t.loginButton}
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title={t.notifications}>
      <div class="subtabs">
        <button
          type="button"
          class={`subtab ${active === "all" ? "active" : ""}`}
          onClick={() => navigate("/notifications")}
        >
          {t.all}
        </button>
        <button
          type="button"
          class={`subtab ${active === "grouped" ? "active" : ""}`}
          onClick={() => navigate("/notifications/grouped")}
        >
          {t.notificationsGrouped}
        </button>
        <button
          type="button"
          class={`subtab ${active === "mentions" ? "active" : ""}`}
          onClick={() => navigate("/mentions")}
        >
          {t.mentions}
        </button>
      </div>
      {active === "grouped" ? (
        <GroupedNotificationsFeed instance={account.instance} />
      ) : (
        <NotificationsFeed instance={account.instance} mode={active} />
      )}
    </PageShell>
  );
}
