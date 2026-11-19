import type { JSX } from "preact";
import { t } from "../../i18n/pt-BR";
import { currentAccount } from "../../state/store";
import { Icon } from "../ui/Icon";

export function SecurityPanel(): JSX.Element {
  const account = currentAccount();
  if (!account) return <></>;
  const base = `https://${account.instance}`;
  const links = [
    {
      href: `${base}/auth/edit`,
      icon: "lock-line",
      label: t.changePassword,
      hint: t.changePasswordHint,
    },
    {
      href: `${base}/settings/two_factor_authentication_methods`,
      icon: "shield-line",
      label: t.twoFactor,
      hint: t.twoFactorHint,
    },
    {
      href: `${base}/oauth/authorized_applications`,
      icon: "link-line",
      label: t.authorizedApps,
      hint: t.authorizedAppsHint,
    },
    {
      href: `${base}/settings/login_activities`,
      icon: "history-line",
      label: t.loginActivity,
      hint: t.loginActivityHint,
    },
  ];

  return (
    <section class="account-panel">
      <div>
        <h2>{t.passwordSecurity}</h2>
        <p class="muted">{t.passwordSecurityHint}</p>
      </div>
      <div class="account-link-list">
        {links.map((link) => (
          <a
            key={link.href}
            class="account-link"
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name={link.icon} size={18} />
            <span class="row-main">
              <span class="row-title">{link.label}</span>
              <span class="row-sub">{link.hint}</span>
            </span>
            <Icon name="external-link-line" size={15} />
          </a>
        ))}
      </div>
      <p class="muted">{t.securityInstanceNote}</p>
    </section>
  );
}
