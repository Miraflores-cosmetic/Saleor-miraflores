'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminBackendJson } from '@/lib/adminBackendFetch';
import type { QuizReportOverview, QuizReportPeriodKind } from '@/lib/adminQuizReportTypes';
import catalogStyles from '@/app/(admin)/admin/catalog/catalogAdmin.module.css';
import settingsStyles from '@/app/(admin)/admin/settings/Settings.module.css';
import styles from './QuizReport.module.css';

const PRESET_PERIODS: { id: Exclude<QuizReportPeriodKind, 'custom'>; label: string }[] = [
  { id: '7d', label: '7 дней' },
  { id: '30d', label: '30 дней' },
  { id: '90d', label: '90 дней' },
];

function todayYmd(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
}

function monthStartYmd(): string {
  return `${todayYmd().slice(0, 7)}-01`;
}

function formatYmdRu(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${d}.${m}.${y}`;
}

function formatPeriodRange(fromDate: string, toDate: string): string {
  if (fromDate === toDate) return formatYmdRu(fromDate);
  return `${formatYmdRu(fromDate)} – ${formatYmdRu(toDate)}`;
}

function formatDuration(sec: number): string {
  if (!sec) return '—';
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} м ${s} с` : `${m} м`;
}

function funnelFillPercent(views: number, maxViews: number): number {
  if (maxViews <= 0 || views <= 0) return 0;
  return Math.max(4, Math.round((views / maxViews) * 100));
}

export function QuizReportClient() {
  const [period, setPeriod] = useState<QuizReportPeriodKind>('30d');
  const [draftFrom, setDraftFrom] = useState(monthStartYmd);
  const [draftTo, setDraftTo] = useState(todayYmd);
  const [appliedFrom, setAppliedFrom] = useState(monthStartYmd);
  const [appliedTo, setAppliedTo] = useState(todayYmd);
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const periodMenuRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<QuizReportOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const customPending = draftFrom !== appliedFrom || draftTo !== appliedTo;

  const query = useMemo(() => {
    const sp = new URLSearchParams({ period });
    if (period === 'custom') {
      sp.set('from', appliedFrom);
      sp.set('to', appliedTo);
    }
    return sp.toString();
  }, [period, appliedFrom, appliedTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminBackendJson<QuizReportOverview>(`quiz/admin/overview?${query}`);
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Не удалось загрузить отчёт');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!periodMenuOpen) return;
    const onPointer = (e: MouseEvent) => {
      const el = periodMenuRef.current;
      if (el && !el.contains(e.target as Node)) setPeriodMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPeriodMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [periodMenuOpen]);

  const applyCustomRange = () => {
    if (!draftFrom || !draftTo) return;
    setAppliedFrom(draftFrom);
    setAppliedTo(draftTo);
    setPeriod('custom');
    setPeriodMenuOpen(false);
  };

  const customChipLabel =
    period === 'custom' ? formatPeriodRange(appliedFrom, appliedTo) : 'Период';

  const maxFunnelViews = data ? Math.max(1, ...data.funnel.map((f) => f.views)) : 1;

  return (
    <div className={styles.root}>
      <p className={catalogStyles.muted}>
        Анонимные прохождения с витрины. Данные появляются после того, как пользователи проходят
        квиз с включённым трекингом.
      </p>

      <div className={styles.periodRow}>
        {PRESET_PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`${styles.periodChip} ${period === p.id ? styles.periodChipActive : ''}`}
            onClick={() => {
              setPeriod(p.id);
              setPeriodMenuOpen(false);
            }}
          >
            {p.label}
          </button>
        ))}

        <div className={styles.periodChipWrap} ref={periodMenuRef}>
          <button
            type="button"
            className={`${styles.periodChip} ${period === 'custom' ? styles.periodChipActive : ''}`}
            aria-expanded={periodMenuOpen}
            aria-haspopup="dialog"
            onClick={() => {
              if (periodMenuOpen) {
                setPeriodMenuOpen(false);
                return;
              }
              setDraftFrom(appliedFrom);
              setDraftTo(appliedTo);
              setPeriodMenuOpen(true);
            }}
          >
            {customChipLabel}
          </button>

          {periodMenuOpen ? (
            <div className={styles.periodPopover} role="dialog" aria-label="Выбор периода">
              <label className={styles.periodDateField}>
                <span>С</span>
                <input
                  className={styles.periodDateInput}
                  type="date"
                  value={draftFrom}
                  max={draftTo}
                  onChange={(e) => setDraftFrom(e.target.value)}
                />
              </label>
              <label className={styles.periodDateField}>
                <span>По</span>
                <input
                  className={styles.periodDateInput}
                  type="date"
                  value={draftTo}
                  min={draftFrom}
                  max={todayYmd()}
                  onChange={(e) => setDraftTo(e.target.value)}
                />
              </label>
              <div className={styles.periodPopoverActions}>
                <button
                  type="button"
                  className={styles.periodChip}
                  onClick={() => setPeriodMenuOpen(false)}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className={`${styles.periodChip} ${styles.periodChipActive}`}
                  disabled={
                    !draftFrom || !draftTo || (!customPending && period === 'custom') || loading
                  }
                  onClick={applyCustomRange}
                >
                  Применить
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {loading ? <p className={catalogStyles.muted}>Загрузка…</p> : null}
      {error ? (
        <p className={catalogStyles.error} role="alert">
          {error}
        </p>
      ) : null}

      {!loading && data ? (
        <>
          <div className={styles.kpiGrid}>
            <div className={`${settingsStyles.kpi} ${styles.kpiCard}`}>
              <p className={styles.kpiValue}>{data.starts}</p>
              <p className={styles.kpiLabel}>Старты</p>
              <p className={catalogStyles.muted}>Уникальные сессии quiz_start</p>
            </div>
            <div className={`${settingsStyles.kpi} ${styles.kpiCard}`}>
              <p className={styles.kpiValue}>{data.completions}</p>
              <p className={styles.kpiLabel}>Завершения</p>
              <p className={catalogStyles.muted}>Сессии с quiz_complete</p>
            </div>
            <div className={`${settingsStyles.kpi} ${styles.kpiCard}`}>
              <p className={styles.kpiValue}>{data.conversionRate}%</p>
              <p className={styles.kpiLabel}>Конверсия</p>
              <p className={catalogStyles.muted}>Завершения / старты</p>
            </div>
            <div className={`${settingsStyles.kpi} ${styles.kpiCard}`}>
              <p className={styles.kpiValue}>{formatDuration(data.avgDurationSec)}</p>
              <p className={styles.kpiLabel}>Ср. время</p>
              <p className={catalogStyles.muted}>От старта до результата</p>
            </div>
          </div>

          <section className={styles.section}>
            <h2 className={catalogStyles.sectionTitle}>Ветки</h2>
            <div className={styles.zoneRow}>
              <div className={`${settingsStyles.kpi} ${styles.kpiCard}`}>
                <p className={styles.kpiValue}>{data.zones.face}</p>
                <p className={styles.kpiLabel}>Лицо</p>
              </div>
              <div className={`${settingsStyles.kpi} ${styles.kpiCard}`}>
                <p className={styles.kpiValue}>{data.zones.hair}</p>
                <p className={styles.kpiLabel}>Волосы</p>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={catalogStyles.sectionTitle}>Воронка</h2>
            <ol className={styles.funnel}>
              {data.funnel.map((step, index) => (
                <li key={step.key} className={styles.funnelRow}>
                  <span className={styles.funnelIndex}>{index + 1}</span>
                  <span className={styles.funnelLabel}>{step.label}</span>
                  <span className={styles.funnelBarTrack}>
                    <span
                      className={styles.funnelBarFill}
                      style={{ width: `${funnelFillPercent(step.views, maxFunnelViews)}%` }}
                    />
                  </span>
                  <span className={styles.funnelCount}>{step.views}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.section}>
            <h2 className={catalogStyles.sectionTitle}>Блоки результата</h2>
            {data.topResultBlocks.length === 0 ? (
              <p className={catalogStyles.muted}>Пока нет завершений с blockKeys в meta.</p>
            ) : (
              <ul className={styles.planList}>
                {data.topResultBlocks.map((row) => (
                  <li key={row.key} className={styles.planCard}>
                    <strong>{row.key}</strong>
                    <p className={catalogStyles.muted}>{row.count} раз</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
