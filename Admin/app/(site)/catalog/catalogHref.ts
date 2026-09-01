/** Path + query href для крошек/пузырей/фильтров.
 *  cat/sub → `/catalog/[cat]/[sub]`; остальное (tag, sale, price…) — query.
 */
export function catalogHref(
  current: URLSearchParams,
  patch: Record<string, string | null>,
  path: { cat?: string; sub?: string } = {},
): string {
  let cat: string | null = path.cat?.trim() || null;
  let sub: string | null = path.sub?.trim() || null;

  if ('cat' in patch) {
    cat = patch.cat?.trim() || null;
    if (!cat) sub = null;
  }
  if ('sub' in patch) {
    sub = patch.sub?.trim() || null;
  }

  const sp = new URLSearchParams(current.toString());
  sp.delete('cat');
  sp.delete('sub');
  sp.delete('page');

  for (const [k, v] of Object.entries(patch)) {
    if (k === 'cat' || k === 'sub') continue;
    if (v == null || v === '') sp.delete(k);
    else sp.set(k, v);
  }

  let base = '/catalog';
  if (cat) {
    base += `/${encodeURIComponent(cat)}`;
    if (sub) base += `/${encodeURIComponent(sub)}`;
  }

  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}
