import type { JSX } from "preact";
import { t } from "../../i18n/pt-BR";
import { Link } from "../../lib/router";
import { signOut } from "../../state/boot";
import { currentAccount, store } from "../../state/store";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import "./account.css";

export function AccountMenu({ onClose }: { onClose: () => void }): JSX.Element | null {
  const account = currentAccount();
  if (!account) return null;
  const me = store.me;
  const profileHref = me ? `/${encodeURIComponent(account.instance)}/a/${me.id}` : "/login";

  const logout = async (): Promise<void> => {
    if (!confirm(t.logoutConfirm)) return;
    onClose();
    await signOut();
  };

  return (
    <Sheet title={t.account} onClose={onClose} class="mobile-menu account-menu">
      <div class="account-menu-head">
        <Avatar
          src={me?.avatarStatic || me?.avatar || account.avatar}
          name={me?.displayName || account.displayName}
          size={44}
        />
        <div>
          <strong>{me?.displayName || account.displayName}</strong>
          <span>@{account.handle}</span>
        </div>
      </div>
      <div class="menu-section">
        <Link href={profileHref} class="menu-row" onClick={onClose}>
          <Icon name="user-3-line" size={18} />
          <span>{t.profile}</span>
        </Link>
        <Link href="/account" class="menu-row" onClick={onClose}>
          <Icon name="settings-3-line" size={18} />
          <span>{t.account}</span>
        </Link>
        <Link href="/accounts" class="menu-row" onClick={onClose}>
          <Icon name="switch-line" size={18} />
          <span>{t.accountSwitch}</span>
        </Link>
        <a
          href={`https://${account.instance}`}
          class="menu-row"
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
        >
          <Icon name="globe-line" size={18} />
          <span>{t.openInstance}</span>
        </a>
        <button type="button" class="menu-row account-menu-logout" onClick={() => void logout()}>
          <Icon name="exit-line" size={18} />
          <span>{t.logout}</span>
        </button>
      </div>
    </Sheet>
  );
}
