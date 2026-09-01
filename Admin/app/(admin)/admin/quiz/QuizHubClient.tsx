'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AdminTabs } from '@/components/AdminTabs/AdminTabs';
import { QuizContentAdminClient } from './QuizContentAdminClient';
import { QuizReportClient } from './QuizReportClient';
import catalogStyles from '@/app/(admin)/admin/catalog/catalogAdmin.module.css';

export type QuizTab = 'settings' | 'report';

const TAB_ITEMS: { id: QuizTab; label: string }[] = [
  { id: 'settings', label: 'Настройка' },
  { id: 'report', label: 'Отчет' },
];

function parseTab(raw: string | null): QuizTab {
  if (raw === 'report') return 'report';
  return 'settings';
}

export function QuizHubClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = useMemo(() => parseTab(searchParams.get('tab')), [searchParams]);

  const setTab = useCallback(
    (next: QuizTab) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next === 'settings') sp.delete('tab');
      else sp.set('tab', next);
      const q = sp.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <>
      <h1 className={catalogStyles.title}>Квиз</h1>
      <AdminTabs
        ariaLabel="Разделы квиза"
        variant="underline"
        compact
        activeId={tab}
        onChange={(id) => setTab(id as QuizTab)}
        items={TAB_ITEMS}
      />
      {tab === 'settings' ? <QuizContentAdminClient /> : null}
      {tab === 'report' ? <QuizReportClient /> : null}
    </>
  );
}
