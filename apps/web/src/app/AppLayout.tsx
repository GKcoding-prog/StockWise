import type { PermissionKey } from '@stockwise/shared';
import {
  Boxes,
  ChevronDown,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { chooseLanguage } from '@/lib/i18n';
import { useAuth, useCan, useMe } from './auth';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  perm?: PermissionKey;
  end?: boolean;
}

/** Sidebar order and visibility (docs/06 §2). Modules not built yet are not listed. */
function useNavItems(): NavItem[] {
  const { t } = useTranslation();
  const can = useCan();
  const items: NavItem[] = [
    {
      to: '/',
      label: t('common:nav.dashboard'),
      icon: LayoutDashboard,
      end: true,
    },
    {
      to: '/products',
      label: t('common:nav.products'),
      icon: Package,
      perm: 'products.view',
    },
    {
      to: '/inventory',
      label: t('common:nav.inventory'),
      icon: Boxes,
      perm: 'products.view',
      end: true,
    },
    {
      to: '/inventory/movements',
      label: t('common:nav.movements'),
      icon: History,
      perm: 'inventory.view_movements',
    },
    {
      to: '/purchases',
      label: t('common:nav.purchases'),
      icon: ClipboardList,
      perm: 'purchases.view',
    },
    {
      to: '/suppliers',
      label: t('common:nav.suppliers'),
      icon: Truck,
      perm: 'suppliers.view',
    },
    { to: '/settings', label: t('common:nav.settings'), icon: Settings },
  ];
  return items.filter((i) => !i.perm || can(i.perm));
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const items = useNavItems();
  return (
    <nav className="space-y-0.5 px-3">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
              isActive ? 'bg-brand-800 text-white' : 'text-stone-700 hover:bg-stone-100'
            }`
          }
        >
          <Icon className="size-4.5 shrink-0" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function BusinessSwitcher() {
  const me = useMe();
  const { switchBusiness } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  if (me.memberships.length < 2) {
    return (
      <span className="truncate text-sm font-semibold text-stone-900">{me.business?.name}</span>
    );
  }
  return (
    <label className="relative flex min-w-0 items-center">
      <span className="sr-only">{t('common:header.switchBusiness')}</span>
      <select
        className="min-w-0 appearance-none truncate rounded-md bg-transparent py-1 pr-6 text-sm font-semibold text-stone-900 hover:bg-stone-100"
        value={me.business?.id}
        onChange={async (e) => {
          await switchBusiness(e.target.value);
          navigate('/');
        }}
      >
        {me.memberships.map((m) => (
          <option key={m.businessId} value={m.businessId}>
            {m.businessName}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-1 size-4 text-stone-500"
        aria-hidden
      />
    </label>
  );
}

function LanguageToggle() {
  const { i18n, t } = useTranslation();
  return (
    <div
      className="flex rounded-lg border border-stone-200 p-0.5 text-xs font-medium"
      role="group"
      aria-label={t('common:header.language')}
    >
      {(['fr', 'en'] as const).map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => chooseLanguage(lng)}
          aria-pressed={i18n.language === lng}
          className={`rounded-md px-2 py-1 uppercase ${i18n.language === lng ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
        >
          {lng}
        </button>
      ))}
    </div>
  );
}

export function AppLayout() {
  const me = useMe();
  const { signOut } = useAuth();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = useNavItems();
  const bottom = items.filter((i) => ['/', '/products', '/inventory'].includes(i.to));

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-stone-200 bg-white md:flex">
        <div className="flex h-14 items-center gap-2 px-6">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span className="text-base font-semibold tracking-tight">StockWise</span>
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          <SideNav />
        </div>
        <div className="border-t border-stone-200 p-3">
          <p className="truncate px-3 text-sm font-medium">{me.user.fullName}</p>
          <p className="truncate px-3 text-xs text-stone-500">
            {me.role?.name && t(`common:roles.${me.role.key}`, { defaultValue: me.role.name })}
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
          >
            <LogOut className="size-4" aria-hidden />
            {t('common:actions.signOut')}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-16 md:pb-0">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-stone-200 bg-white/95 px-4 backdrop-blur md:px-6">
          <img src="/favicon.svg" alt="" className="size-7 md:hidden" />
          <div className="min-w-0 flex-1">
            <BusinessSwitcher />
          </div>
          <LanguageToggle />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-6 md:py-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom bar: Dashboard · Products · Stock · More (docs/06 §2) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-stone-200 bg-white md:hidden"
        aria-label={t('common:nav.main')}
      >
        {bottom.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-brand-800' : 'text-stone-600'}`
            }
          >
            <Icon className="size-5" aria-hidden />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-stone-600"
        >
          <Menu className="size-5" aria-hidden />
          {t('common:nav.more')}
        </button>
      </nav>

      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-stone-900/40 md:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white pt-2 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-2">
              <p className="font-semibold">{me.user.fullName}</p>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label={t('common:actions.close')}
                className="rounded-md p-1 hover:bg-stone-100"
              >
                <X className="size-5" />
              </button>
            </div>
            <SideNav onNavigate={() => setMenuOpen(false)} />
            <div className="mt-2 px-3">
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
              >
                <LogOut className="size-4" aria-hidden />
                {t('common:actions.signOut')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
