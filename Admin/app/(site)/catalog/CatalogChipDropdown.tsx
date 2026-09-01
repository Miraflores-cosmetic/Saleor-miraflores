'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './CatalogPage.module.css';

export function CatalogChipDropdown({
  id,
  label,
  open,
  onToggle,
  onClose,
  children,
}: {
  id: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = `chip-panel-${id}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={styles.chipWrap}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.chip}
        data-open={open || undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={panelId}
        onClick={onToggle}
      >
        {label}
        <span className={styles.chipCaret} aria-hidden />
      </button>
      {open ? (
        <>
          <button
            type="button"
            className={styles.chipBackdrop}
            aria-label="Закрыть"
            onClick={onClose}
          />
          <div
            id={panelId}
            className={styles.chipPanel}
            role="listbox"
            aria-label={label}
          >
            {children}
          </div>
        </>
      ) : null}
    </div>
  );
}
