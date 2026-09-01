'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminCompactBtn } from '@/components/AdminCompactBtn/AdminCompactBtn';
import { AdminRichField } from '@/components/admin/AdminRichField/AdminRichField';
import { AdminTextArea } from '@/components/AdminTextField/AdminTextField';
import { useToast } from '@/components/Toast/ToastProvider';
import { DiscountProductPickerModal } from '@/app/(admin)/admin/discounts/DiscountScopePickerModal';
import {
  AdminBackendRequestError,
  adminBackendFetch,
  adminBackendJson,
} from '@/lib/adminBackendFetch';
import {
  appendQuizProductsToEntry,
  isQuizResultBlockEmpty,
} from '@/lib/quizProductSnippet';
import {
  QUIZ_KEY_HINTS_RU,
  QUIZ_MEDIA_KEYS,
  QUIZ_RESULT_GROUPS,
  QUIZ_RESULT_TEXT_KEY_SET,
  QUIZ_UI_TEXT_KEYS,
} from '@/lib/quizContentConfig';
import catalogStyles from '@/app/(admin)/admin/catalog/catalogAdmin.module.css';
import styles from '@/app/(admin)/admin/settings/Settings.module.css';

type QuizEntryDraft = {
  key: string;
  plain: string;
  html: string;
  mediaUrl: string;
  mediaType: 'image' | 'video' | '';
};

type QuizApiItem = {
  key: string;
  plain: string;
  html: string;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
};

async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await adminBackendFetch('catalog/admin/upload-rich-media?type=image', {
    method: 'POST',
    body: fd,
  });
  const data = (await res.json()) as { url?: string };
  if (!res.ok || !data.url) {
    throw new Error('Не удалось загрузить файл');
  }
  return data.url;
}

function TextKeyEditor({
  item,
  disabled,
  onChange,
  allowProducts = false,
  onAddProducts,
}: {
  item: QuizEntryDraft;
  disabled: boolean;
  onChange: (patch: Partial<QuizEntryDraft>) => void;
  allowProducts?: boolean;
  onAddProducts?: () => void;
}) {
  const hint = QUIZ_KEY_HINTS_RU[item.key];
  const empty = allowProducts && isQuizResultBlockEmpty(item);
  return (
    <li className={styles.faqCard}>
      <div>
        <strong>{item.key}</strong>
        {empty ? (
          <p className={catalogStyles.error} style={{ margin: '4px 0 0', fontSize: '0.875rem' }}>
            Блок пустой — на витрине не отобразится. Заполните текст и добавьте товары.
          </p>
        ) : null}
        {hint ? <p className={catalogStyles.muted} style={{ margin: '4px 0 0' }}>{hint}</p> : null}
      </div>
      <AdminTextArea
        label="Текст (plain)"
        value={item.plain}
        onChange={(e) => onChange({ plain: e.target.value })}
        disabled={disabled}
        rows={3}
        maxLength={10000}
      />
      <AdminRichField
        label="HTML (опционально)"
        value={item.html}
        onChange={(html) => onChange({ html })}
        disabled={disabled}
      />
      {allowProducts && onAddProducts ? (
        <AdminCompactBtn
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={onAddProducts}
        >
          Добавить товар
        </AdminCompactBtn>
      ) : null}
    </li>
  );
}

function MediaKeyEditor({
  item,
  disabled,
  onChange,
  onUpload,
}: {
  item: QuizEntryDraft;
  disabled: boolean;
  onChange: (patch: Partial<QuizEntryDraft>) => void;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hint = QUIZ_KEY_HINTS_RU[item.key];
  return (
    <li className={styles.faqCard}>
      <div>
        <strong>{item.key}</strong>
        {hint ? (
          <p className={catalogStyles.muted} style={{ margin: '4px 0 0' }}>
            {hint}
          </p>
        ) : (
          <p className={catalogStyles.muted} style={{ margin: '4px 0 0' }}>
            Медиафайл (изображение или видео по URL)
          </p>
        )}
      </div>
      <AdminTextArea
        label="URL"
        value={item.mediaUrl}
        onChange={(e) => onChange({ mediaUrl: e.target.value })}
        disabled={disabled}
        rows={2}
        maxLength={2000}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <AdminCompactBtn
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Загрузить изображение
        </AdminCompactBtn>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onUpload(file);
          }}
        />
        <label className={styles.activeLabel}>
          <select
            value={item.mediaType}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                mediaType: e.target.value as QuizEntryDraft['mediaType'],
              })
            }
            style={{ fontFamily: 'inherit', fontSize: '0.875rem' }}
          >
            <option value="">— тип —</option>
            <option value="image">image</option>
            <option value="video">video</option>
          </select>
        </label>
      </div>
      {item.mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.mediaUrl} alt="" style={{ maxWidth: 200, borderRadius: 8 }} />
      ) : null}
    </li>
  );
}

export function QuizContentAdminClient() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadedOk, setLoadedOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<QuizEntryDraft[]>([]);
  const [productPickerKey, setProductPickerKey] = useState<string | null>(null);
  const [productPickerLoading, setProductPickerLoading] = useState(false);

  const markDirty = useCallback(() => setDirty(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadedOk(false);
    try {
      const data = await adminBackendJson<{ items: QuizApiItem[] }>('settings/admin/quiz-content');
      setItems(
        (data.items ?? []).map((it) => ({
          key: it.key,
          plain: it.plain ?? '',
          html: it.html ?? '',
          mediaUrl: it.mediaUrl ?? '',
          mediaType: it.mediaType ?? '',
        })),
      );
      setLoadedOk(true);
      setDirty(false);
    } catch (e) {
      setItems([]);
      setLoadedOk(false);
      setError(e instanceof AdminBackendRequestError ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function updateKey(key: string, patch: Partial<QuizEntryDraft>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
    markDirty();
  }

  async function handleProductsPicked(ids: string[], labels: Record<string, string>) {
    const key = productPickerKey;
    setProductPickerKey(null);
    if (!key || ids.length === 0) return;

    setProductPickerLoading(true);
    try {
      const products = await Promise.all(
        ids.map(async (id) => {
          const p = await adminBackendJson<{ name: string; slug: string }>(
            `catalog/admin/products/${id}`,
          );
          return { name: labels[id] || p.name, slug: p.slug };
        }),
      );
      const current = items.find((it) => it.key === key);
      if (!current) return;
      const next = appendQuizProductsToEntry(current, products);
      updateKey(key, next);
      showToast(
        products.length === 1
          ? `Товар «${products[0]!.name}» добавлен в ${key}`
          : `Добавлено товаров: ${products.length}`,
      );
    } catch (e) {
      showToast(
        e instanceof AdminBackendRequestError ? e.message : 'Не удалось добавить товар',
      );
    } finally {
      setProductPickerLoading(false);
    }
  }

  const emptyResultKeys = items
    .filter((it) => QUIZ_RESULT_TEXT_KEY_SET.has(it.key) && isQuizResultBlockEmpty(it))
    .map((it) => it.key);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!loadedOk) return;
    setSaving(true);
    try {
      const payload = {
        items: items.map((it) => ({
          key: it.key,
          plain: it.plain,
          html: it.html,
          mediaUrl: it.mediaUrl.trim() || null,
          mediaType: it.mediaType === 'image' || it.mediaType === 'video' ? it.mediaType : null,
        })),
      };
      const data = await adminBackendJson<{ items: QuizApiItem[] }>('settings/admin/quiz-content', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setItems(
        (data.items ?? []).map((it) => ({
          key: it.key,
          plain: it.plain ?? '',
          html: it.html ?? '',
          mediaUrl: it.mediaUrl ?? '',
          mediaType: it.mediaType ?? '',
        })),
      );
      setDirty(false);
      showToast('Сохранено');
    } catch (e) {
      showToast(e instanceof AdminBackendRequestError ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  const uiItems = items.filter((it) => (QUIZ_UI_TEXT_KEYS as readonly string[]).includes(it.key));
  const byKey = new Map(items.map((it) => [it.key, it]));
  const mediaItems = items.filter((it) => (QUIZ_MEDIA_KEYS as readonly string[]).includes(it.key));

  if (loading) return <p className={catalogStyles.muted}>Загрузка…</p>;
  if (error) {
    return (
      <p className={catalogStyles.error} role="alert">
        {error}
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void onSave(e)}>
      <p className={catalogStyles.muted} style={{ marginBottom: 16 }}>
        Тексты и медиа квиза. В блоках результата добавляйте товары кнопкой «Добавить товар» —
        на витрине появятся карточки как в каталоге (ссылка <code>/product/&#123;slug&#125;</code>).
        Пустые блоки результата на сайте не показываются.
      </p>
      {emptyResultKeys.length > 0 ? (
        <p className={catalogStyles.error} role="status" style={{ marginBottom: 16 }}>
          Не заполнены блоки результата: {emptyResultKeys.join(', ')}. Программа ухода в ЛК будет
          пустой для пользователей с этими ветками.
        </p>
      ) : null}
      <AdminCompactBtn type="submit" disabled={!loadedOk || saving || !dirty}>
        {saving ? 'Сохранение…' : 'Сохранить'}
      </AdminCompactBtn>

      <h2 className={catalogStyles.sectionTitle} style={{ marginTop: 24 }}>
        UI-тексты
      </h2>
      <ul className={styles.faqList}>
        {uiItems.map((it) => (
          <TextKeyEditor
            key={it.key}
            item={it}
            disabled={saving}
            onChange={(patch) => updateKey(it.key, patch)}
          />
        ))}
      </ul>

      <h2 className={catalogStyles.sectionTitle}>Тексты результата</h2>
      <p className={catalogStyles.muted} style={{ marginTop: -8, marginBottom: 16 }}>
        Блоки экрана результата лица: SPF → матрица задач (young/mature) → отёчность. Для каждого
        блока — вводный текст и рекомендуемые товары. Финал — ключ <code>end_face_care</code> в
        UI-текстах.
      </p>
      {QUIZ_RESULT_GROUPS.map((group) => (
        <section key={group.title} style={{ marginBottom: 24 }}>
          <h3 className={catalogStyles.sectionTitle} style={{ fontSize: '1rem', marginBottom: 4 }}>
            {group.title}
          </h3>
          <p className={catalogStyles.muted} style={{ marginBottom: 12 }}>
            {group.description}
          </p>
          <ul className={styles.faqList}>
            {group.keys.map((key) => {
              const it = byKey.get(key);
              if (!it) return null;
              return (
                <TextKeyEditor
                  key={key}
                  item={it}
                  disabled={saving || productPickerLoading}
                  allowProducts
                  onAddProducts={() => setProductPickerKey(key)}
                  onChange={(patch) => updateKey(key, patch)}
                />
              );
            })}
          </ul>
        </section>
      ))}

      <h2 className={catalogStyles.sectionTitle}>Медиа</h2>
      <ul className={styles.faqList}>
        {mediaItems.map((it) => (
          <MediaKeyEditor
            key={it.key}
            item={it}
            disabled={saving}
            onChange={(patch) => updateKey(it.key, patch)}
            onUpload={async (file) => {
              try {
                const url = await uploadImage(file);
                updateKey(it.key, { mediaUrl: url, mediaType: 'image' });
              } catch {
                showToast('Не удалось загрузить файл');
              }
            }}
          />
        ))}
      </ul>

      <AdminCompactBtn type="submit" disabled={!loadedOk || saving || !dirty} style={{ marginTop: 16 }}>
        {saving ? 'Сохранение…' : 'Сохранить'}
      </AdminCompactBtn>

      <DiscountProductPickerModal
        open={productPickerKey !== null}
        selectedIds={[]}
        selectedLabels={{}}
        onClose={() => setProductPickerKey(null)}
        onApply={(ids, labels) => void handleProductsPicked(ids, labels)}
      />
    </form>
  );
}
