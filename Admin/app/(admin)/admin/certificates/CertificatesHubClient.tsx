'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AdminCompactBtn } from '@/components/AdminCompactBtn/AdminCompactBtn';
import { AdminTabs } from '@/components/AdminTabs/AdminTabs';
import tabStyles from '@/components/AdminTabs/AdminTabs.module.css';
import { CertificateListClient } from './CertificateListClient';
import { CertificateIssueClient } from './issue/CertificateIssueClient';
import { DenominationListClient } from './denominations/DenominationListClient';
import styles from '@/app/(admin)/admin/catalog/catalogAdmin.module.css';

export type CertificatesHubTab = 'list' | 'issue' | 'denoms';

const TAB_ITEMS: { id: CertificatesHubTab; label: string }[] = [
  { id: 'list', label: 'Список' },
  { id: 'issue', label: 'Выпуск' },
  { id: 'denoms', label: 'Номиналы' },
];

function parseTab(raw: string | null): CertificatesHubTab {
  if (raw === 'issue' || raw === 'denoms' || raw === 'list') return raw;
  return 'list';
}

export function CertificatesHubClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = useMemo(() => parseTab(searchParams.get('tab')), [searchParams]);
  const [createDenomOpen, setCreateDenomOpen] = useState(false);
  const denomsTab = tab === 'denoms';

  const setTab = useCallback(
    (next: CertificatesHubTab) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next === 'list') sp.delete('tab');
      else sp.set('tab', next);
      const q = sp.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
      if (next !== 'denoms') setCreateDenomOpen(false);
    },
    [pathname, router, searchParams],
  );

  return (
    <>
      <h1 className={styles.title}>Сертификаты</h1>
      <AdminTabs
        ariaLabel="Разделы сертификатов"
        variant="underline"
        compact
        activeId={tab}
        onChange={(id) => setTab(id as CertificatesHubTab)}
        items={TAB_ITEMS}
        end={
          <span className={denomsTab ? undefined : tabStyles.endSlotHidden}>
            <AdminCompactBtn
              type="button"
              variant="accent"
              onClick={() => setCreateDenomOpen(true)}
              tabIndex={denomsTab ? 0 : -1}
              aria-hidden={!denomsTab}
            >
              Создать
            </AdminCompactBtn>
          </span>
        }
      />
      {tab === 'list' ? <CertificateListClient /> : null}
      {tab === 'issue' ? (
        <CertificateIssueClient onGoToDenoms={() => setTab('denoms')} />
      ) : null}
      {tab === 'denoms' ? (
        <DenominationListClient
          createOpen={createDenomOpen}
          onCreateOpenChange={setCreateDenomOpen}
        />
      ) : null}
    </>
  );
}
