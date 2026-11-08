import { DEFAULT_TIMEZONE, intlLocale, type Locale } from '@stockwise/shared';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../../lib/format';
import { useHealth } from './api';

function StatusRow({ label, ok, text }: { label: string; ok: boolean | null; text: string }) {
  const dot = ok === null ? 'bg-slate-300' : ok ? 'bg-emerald-500' : 'bg-red-500';
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="flex items-center gap-2 text-sm font-medium">
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        {text}
      </span>
    </div>
  );
}

/** Live API + database status from GET /api/v1/health. Real data only — no placeholders. */
export function SystemStatusCard() {
  const { t, i18n } = useTranslation();
  const { data, isPending, isError, refetch, isFetching } = useHealth();
  const locale = intlLocale(i18n.language as Locale);

  return (
    <section
      aria-labelledby="system-status-title"
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 id="system-status-title" className="mb-2 text-base font-semibold">
        {t('system.title')}
      </h2>

      {isPending ? (
        <p role="status" className="py-2 text-sm text-slate-500">
          {t('system.checking')}
        </p>
      ) : isError ? (
        <div role="alert" className="space-y-3 py-2">
          <StatusRow label={t('system.api')} ok={false} text={t('system.down')} />
          <p className="text-sm text-red-700">{t('system.unreachable')}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {t('system.retry')}
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          <StatusRow label={t('system.api')} ok text={t('system.up')} />
          <StatusRow
            label={t('system.database')}
            ok={data.db === 'up'}
            text={t(data.db === 'up' ? 'system.up' : 'system.down')}
          />
          <p className="pt-2 text-xs text-slate-500">
            {t('system.checkedAt', { time: formatDateTime(data.time, locale, DEFAULT_TIMEZONE) })}
          </p>
        </div>
      )}
    </section>
  );
}
