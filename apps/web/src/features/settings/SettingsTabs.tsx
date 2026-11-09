import type { PermissionKey } from '@stockwise/shared';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { useCan } from '@/app/auth';

const TABS: { to: string; key: string; perm?: PermissionKey }[] = [
  { to: '/settings/profile', key: 'profile' },
  { to: '/settings/business', key: 'business', perm: 'business.manage' },
  { to: '/settings/categories', key: 'categories', perm: 'products.view' },
];

export function SettingsTabs() {
  const { t } = useTranslation();
  const can = useCan();
  return (
    <div className="mb-5">
      <h1 className="mb-3 text-xl font-semibold tracking-tight">{t('settings:title')}</h1>
      <nav className="flex gap-1 overflow-x-auto border-b border-stone-200">
        {TABS.filter((tab) => !tab.perm || can(tab.perm)).map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${isActive ? 'border-brand-800 text-brand-900' : 'border-transparent text-stone-600 hover:text-stone-900'}`
            }
          >
            {t(`settings:tabs.${tab.key}`)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
