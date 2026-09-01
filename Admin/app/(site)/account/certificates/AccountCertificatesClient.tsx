'use client';

import { useEffect, useState } from 'react';
import { formatRub } from '@/lib/publicCatalog';
import styles from '../AccountPage.module.css';

type Cert = {
  id: string;
  code: string;
  faceValue: number;
  balance: number;
  status: string;
  source: string;
  issuedAt: string;
  expiresAt: string | null;
  denominationName: string | null;
};

const STATUS_RU: Record<string, string> = {
  ACTIVE: 'Активен',
  USED_UP: 'Израсходован',
  EXPIRED: 'Истёк',
  REVOKED: 'Отозван',
};

function formatDate(iso: string | null): string {
  if (!iso) return 'бессрочно';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU');
}

export function AccountCertificatesClient() {
  const [items, setItems] = useState<Cert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/account/gift-certificates', {
          credentials: 'same-origin',
        });
        if (!res.ok) {
          if (!cancelled) setError('Не удалось загрузить сертификаты');
          return;
        }
        const data = (await res.json()) as Cert[];
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setError('Сеть недоступна');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyCode(id: string, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* ignore */
    }
  }

  if (loading) return <p className={styles.loading}>Загрузка…</p>;
  if (error) return <p className={styles.error}>{error}</p>;
  if (!items.length) {
    return (
      <p className={styles.emptyHint}>
        Пока нет купленных сертификатов.{' '}
        <a href="/certificates">Купить на сайте</a>
      </p>
    );
  }

  return (
    <ul className={styles.certList}>
      {items.map((c) => (
        <li key={c.id} className={styles.certCard}>
          <div className={styles.certHead}>
            <code className={styles.certCode}>{c.code}</code>
            <button
              type="button"
              className={styles.certCopy}
              onClick={() => void copyCode(c.id, c.code)}
            >
              {copiedId === c.id ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
          <p className={styles.certMeta}>
            {c.denominationName ?? 'Сертификат'} · {STATUS_RU[c.status] ?? c.status}
          </p>
          <p className={styles.certMeta}>
            Номинал {formatRub(c.faceValue)} · остаток {formatRub(c.balance)}
          </p>
          <p className={styles.certMeta}>
            Выпущен {formatDate(c.issuedAt)} · до {formatDate(c.expiresAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}
