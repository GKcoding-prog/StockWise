import { SUPPORTED_LOCALES } from '@stockwise/shared';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';

/**
 * App shell. The sidebar gains items as modules are built (docs/06-frontend.md §2);
 * items appear only once their feature exists — no dead links.
 */
export function AppLayout() {
  const { t, i18n } = useTranslation();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[14rem_1fr]">
      <aside className="border-b border-slate-200 bg-white md:min-h-dvh md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 py-4">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <span className="text-lg font-semibold text-brand-800">{t('app.name')}</span>
        </div>
        <nav aria-label="Main" className="px-2 pb-3">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm font-medium ${
                isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-100'
              }`
            }
          >
            {t('nav.home')}
          </NavLink>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-end gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <label htmlFor="language" className="text-sm text-slate-600">
            {t('language.label')}
          </label>
          <select
            id="language"
            value={i18n.language}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l} value={l}>
                {t(`language.${l}`)}
              </option>
            ))}
          </select>
        </header>
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
