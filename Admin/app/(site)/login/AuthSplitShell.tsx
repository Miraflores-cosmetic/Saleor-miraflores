'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './LoginPage.module.css';

type Props = {
  backHref?: string;
  children: ReactNode;
};

export function AuthSplitShell({ backHref = '/', children }: Props) {
  return (
    <main className={styles.page}>
      <div className={styles.visual} aria-hidden>
        <Image
          src="/images/login-cover.webp"
          alt=""
          fill
          priority
          sizes="(max-width: 900px) 100vw, 40vw"
          className={styles.cover}
        />
      </div>

      <div className={styles.panel}>
        <div className={styles.panelInner}>
          <Link href={backHref} className={styles.back}>
            <span className={styles.backArrow} aria-hidden>
              ←
            </span>
            <span>Назад</span>
          </Link>

          {children}
        </div>
      </div>
    </main>
  );
}
