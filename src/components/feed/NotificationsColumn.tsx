import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { t } from "../../i18n/pt-BR";
import { GroupedNotificationsFeed } from "./GroupedNotificationsFeed";
import { NotificationsFeed } from "./NotificationsFeed";

/** Notifications column with the same All/Grouped switch as the page. */
export function NotificationsColumn({
  instance,
  refreshKey,
}: {
  instance: string;
  refreshKey?: number;
}): JSX.Element {
  const [grouped, setGrouped] = useState(false);
  return (
    <div class="notifications-column">
      <div class="subtabs" role="tablist" aria-label={t.notifications}>
        <button
          type="button"
          role="tab"
          aria-selected={!grouped}
          class={`subtab ${grouped ? "" : "active"}`}
          onClick={() => setGrouped(false)}
        >
          {t.all}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={grouped}
          class={`subtab ${grouped ? "active" : ""}`}
          onClick={() => setGrouped(true)}
        >
          {t.notificationsGrouped}
        </button>
      </div>
      {grouped ? (
        <GroupedNotificationsFeed instance={instance} refreshKey={refreshKey} />
      ) : (
        <NotificationsFeed instance={instance} refreshKey={refreshKey} />
      )}
    </div>
  );
}
