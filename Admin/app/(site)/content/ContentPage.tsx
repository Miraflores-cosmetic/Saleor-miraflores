import type { ReactNode } from 'react';
import styles from './ContentPage.module.css';

export function ContentPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className={`padding-global ${styles.main}`}>
      <h1 className={styles.title}>{title}</h1>
      {children}
    </main>
  );
}

export { styles as contentPageStyles };
