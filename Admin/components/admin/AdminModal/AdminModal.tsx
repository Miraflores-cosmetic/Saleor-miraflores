'use client';

import { useEffect, useId, useRef } from 'react';
import { AdminCompactBtn } from '@/components/AdminCompactBtn/AdminCompactBtn';
import catalogStyles from '@/app/(admin)/admin/catalog/catalogAdmin.module.css';
import styles from './AdminModal.module.css';

function CloseBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className={catalogStyles.modalCloseIconBtn}
      onClick={onClick}
      aria-label={label}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className={catalogStyles.modalCloseIconSvg}
      >
        <path
          d="M18 6L6 18M6 6l12 12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function AdminModal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
  size,
  keepMounted = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  /** Larger panel for assistant chat */
  size?: 'default' | 'assistant';
  /** Keep children mounted while closed (state / in-flight abort). */
  keepMounted?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open && !keepMounted) return null;

  const panelClass = [
    styles.panel,
    wide || size === 'assistant' ? styles.panelWide : '',
    size === 'assistant' ? styles.panelAssistant : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={styles.overlay}
      role="presentation"
      hidden={!open}
      style={!open ? { display: 'none' } : undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={panelClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-hidden={!open}
      >
        <div className={styles.panelHead}>
          <h2 id={titleId} className={styles.panelTitle}>
            {title}
          </h2>
          <CloseBtn onClick={onClose} label="Закрыть" />
        </div>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.panelFooter}>{footer}</div> : null}
      </div>
    </div>
  );
}

export function AdminModalActions({
  onCancel,
  onConfirm,
  confirmLabel = 'Готово',
  cancelLabel = 'Отмена',
  confirmDisabled,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
}) {
  return (
    <>
      <AdminCompactBtn type="button" variant="outline" onClick={onCancel}>
        {cancelLabel}
      </AdminCompactBtn>
      <AdminCompactBtn
        type="button"
        variant="accent"
        onClick={onConfirm}
        disabled={confirmDisabled}
      >
        {confirmLabel}
      </AdminCompactBtn>
    </>
  );
}
