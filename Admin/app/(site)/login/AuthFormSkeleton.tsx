import { AuthSplitShell } from './AuthSplitShell';
import styles from './LoginPage.module.css';

type Props = {
  mode?: 'login' | 'register';
};

/** Скелетон формы auth на время Suspense / session. */
export function AuthFormSkeleton({ mode = 'login' }: Props) {
  const rows = mode === 'register' ? 4 : 2;
  return (
    <AuthSplitShell>
      <div className={styles.intro} aria-hidden>
        <span className={`${styles.skel} ${styles.skelTitle}`} />
        <span className={`${styles.skel} ${styles.skelLine}`} />
      </div>
      <div className={styles.form} aria-busy aria-label="Загрузка формы">
        <div className={styles.fields}>
          {Array.from({ length: rows }, (_, i) => (
            <span key={i} className={`${styles.skel} ${styles.skelField}`} />
          ))}
        </div>
        <span className={`${styles.skel} ${styles.skelBtn}`} />
      </div>
    </AuthSplitShell>
  );
}
