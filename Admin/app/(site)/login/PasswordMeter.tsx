'use client';

import {
  passwordStrength,
  passwordStrengthLabel,
  type PasswordStrength,
} from '@/lib/passwordPolicy';
import styles from './PasswordMeter.module.css';

const LEVEL: Record<PasswordStrength, number> = {
  weak: 1,
  fair: 2,
  good: 3,
  strong: 4,
};

export function PasswordMeter({ password }: { password: string }) {
  if (!password) return null;
  const strength = passwordStrength(password);
  const level = LEVEL[strength];

  return (
    <div className={styles.wrap} aria-live="polite">
      <div className={styles.bars} aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={[
              styles.bar,
              i <= level ? styles[`bar_${strength}`] : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        ))}
      </div>
      <p className={styles.label}>
        Надёжность: {passwordStrengthLabel(strength)}
      </p>
    </div>
  );
}
