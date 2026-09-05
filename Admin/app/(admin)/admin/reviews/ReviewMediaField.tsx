'use client';

import { useRef, useState } from 'react';
import { AdminCompactBtn } from '@/components/AdminCompactBtn/AdminCompactBtn';
import {
  AdminBackendRequestError,
  adminBackendFetch,
  readAdminApiError,
} from '@/lib/adminBackendFetch';
import styles from '@/app/(admin)/admin/catalog/catalogAdmin.module.css';

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}

/** Одно вложение витрины: изображение или видео (image1Url). */
export function ReviewMediaField({
  url,
  onChange,
}: {
  url: string | null;
  onChange: (next: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const video = Boolean(url && isVideoUrl(url));

  async function onPick(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await adminBackendFetch('reviews/admin/upload', {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) throw new AdminBackendRequestError(await readAdminApiError(res), res.status);
      const json = (await res.json()) as { url: string };
      onChange(json.url);
    } catch (e) {
      setError(
        e instanceof AdminBackendRequestError ? e.message : 'Не удалось загрузить файл',
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <p className={styles.cardNote} style={{ marginBottom: 8 }}>
        Медиа для витрины
      </p>
      <div className={styles.toolbar} style={{ marginBottom: 10 }}>
        <AdminCompactBtn
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Загрузка…' : url ? 'Заменить' : 'Загрузить фото или видео'}
        </AdminCompactBtn>
        {url ? (
          <AdminCompactBtn
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onChange(null)}
          >
            Убрать
          </AdminCompactBtn>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,.mp4,.mov"
        hidden
        disabled={busy}
        onChange={(e) => void onPick(e.target.files)}
      />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {url ? (
        <div
          style={{
            width: 220,
            height: 280,
            background: '#f5f7f8',
            border: '1px solid #e2e6e8',
            overflow: 'hidden',
          }}
        >
          {video ? (
            <video
              src={url}
              controls
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
        </div>
      ) : (
        <p className={styles.muted}>Файл не выбран</p>
      )}
    </div>
  );
}
