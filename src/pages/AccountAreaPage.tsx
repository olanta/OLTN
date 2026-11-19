import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { t } from "../i18n/pt-BR";
import { beginPointerDrag } from "../lib/pointer-drag";
import { navigate } from "../lib/router";
import { AccountDataPanel } from "../components/account/AccountDataPanel";
import { BlockedDomainsPanel } from "../components/account/BlockedDomainsPanel";
import { PostingDefaultsPanel } from "../components/account/PostingDefaultsPanel";
import { PrivacyPanel } from "../components/account/PrivacyPanel";
import { RelationshipAccountsPanel } from "../components/account/RelationshipAccountsPanel";
import { SecurityPanel } from "../components/account/SecurityPanel";
import { CleanupSettings } from "../components/settings/CleanupSettings";
import { saveAccountWidth, signOut } from "../state/boot";
import { accountNS, currentAccount, store } from "../state/store";
import { Icon } from "../components/ui/Icon";
import { PageShell } from "../components/ui/PageShell";
import { FiltersPanel } from "./FiltersPage";
import "../components/account/account.css";

type SectionId =
  | "words"
  | "mutes"
  | "blocks"
  | "domains"
  | "privacy"
  | "posting"
  | "cleanup"
  | "security"
  | "data";

const SECTIONS: {
  id: SectionId;
  label: () => string;
  icon: string;
  render: () => JSX.Element;
}[] = [
  {
    id: "words",
    label: () => t.mutedWords,
    icon: "filter-line",
    render: () => (
      <>
        <div class="account-panel-head">
          <h2>{t.mutedWords}</h2>
          <p class="muted">{t.mutedWordsHint}</p>
        </div>
        <FiltersPanel />
      </>
    ),
  },
  {
    id: "mutes",
    label: () => t.mutedUsers,
    icon: "volume-line",
    render: () => <RelationshipAccountsPanel kind="mutes" />,
  },
  {
    id: "blocks",
    label: () => t.blockedUsers,
    icon: "user-forbid-line",
    render: () => <RelationshipAccountsPanel kind="blocks" />,
  },
  {
    id: "domains",
    label: () => t.blockedDomains,
    icon: "globe-line",
    render: () => <BlockedDomainsPanel />,
  },
  {
    id: "privacy",
    label: () => t.privacyReach,
    icon: "lock-line",
    render: () => <PrivacyPanel />,
  },
  {
    id: "posting",
    label: () => t.postingDefaults,
    icon: "pencil-line",
    render: () => <PostingDefaultsPanel />,
  },
  {
    id: "cleanup",
    label: () => t.cleanupTitle,
    icon: "delete-line",
    render: () => <CleanupSettings />,
  },
  {
    id: "security",
    label: () => t.passwordSecurity,
    icon: "shield-line",
    render: () => <SecurityPanel />,
  },
  {
    id: "data",
    label: () => t.importExport,
    icon: "file-export-line",
    render: () => <AccountDataPanel />,
  },
];

const ACCOUNT_MIN_WIDTH = 520;

function clampAccountWidth(width: number): number {
  const max = Math.max(ACCOUNT_MIN_WIDTH, Math.min(1000, window.innerWidth - 120));
  return Math.min(max, Math.max(ACCOUNT_MIN_WIDTH, Math.round(width)));
}

export function AccountAreaPage({ params }: { params: { section?: string } }): JSX.Element {
  const active = SECTIONS.find((section) => section.id === params.section) ?? SECTIONS[0];
  const account = currentAccount();
  const [width, setWidth] = useState(() =>
    clampAccountWidth(account ? (store.prefs[accountNS(account)]?.accountWidth ?? 640) : 640),
  );

  useEffect(() => {
    const deck = document.getElementById("main");
    if (!deck) return;
    deck.classList.add("account-page-deck");
    return () => {
      deck.classList.remove("account-page-deck");
      deck.style.removeProperty("--account-w");
    };
  }, []);

  useEffect(() => {
    document.getElementById("main")?.style.setProperty("--account-w", `${width}px`);
  }, [width]);

  const resize = (e: PointerEvent): void => {
    const deck = document.getElementById("main");
    if (!deck) return;
    const startWidth = deck.getBoundingClientRect().width;
    let next = width;
    beginPointerDrag(e, {
      onMove: ({ delta }) => {
        next = clampAccountWidth(startWidth + delta.x);
        deck.style.setProperty("--account-w", `${next}px`);
      },
      onCommit: () => {
        setWidth(next);
        saveAccountWidth(next);
      },
    });
  };

  return (
    <>
      <PageShell title={t.account}>
        <div class="account-area">
          <nav class="account-nav" aria-label={t.account}>
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                class={`account-nav-item ${section.id === active.id ? "active" : ""}`}
                aria-current={section.id === active.id ? "page" : undefined}
                onClick={() => navigate(`/account/${section.id}`)}
              >
                <Icon name={section.icon} size={17} />
                <span>{section.label()}</span>
              </button>
            ))}
            <button
              type="button"
              class="account-nav-item account-nav-logout"
              onClick={() => {
                if (confirm(t.logoutConfirm)) void signOut();
              }}
            >
              <Icon name="exit-line" size={17} />
              <span>{t.logout}</span>
            </button>
          </nav>
          <div class="account-content">{active.render()}</div>
        </div>
      </PageShell>
      <button
        type="button"
        class="account-width-handle"
        aria-label={t.resizeColumn}
        title={t.resizeColumn}
        onPointerDown={resize}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const next = clampAccountWidth(width + (e.key === "ArrowRight" ? 16 : -16));
          setWidth(next);
          saveAccountWidth(next);
        }}
      />
    </>
  );
}
