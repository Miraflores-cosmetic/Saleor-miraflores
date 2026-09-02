export type OnecOfferRow = {
  onecId: string;
  name: string | null;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  quantity: number | null;
};

/** Берёт первое число из текста (поддержка «1 820», «1820.50»). */
function parseNumber(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/\s/g, '').replace(',', '.').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function tagText(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  if (!m?.[1]) return null;
  const text = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  return text || null;
}

/**
 * Разбор CommerceML «ПакетПредложений» (offers.xml).
 * Namespace-агностичный: ищем локальные имена тегов.
 */
export function parseOffersXml(xml: string): OnecOfferRow[] {
  const offers: OnecOfferRow[] = [];
  const offerRe = /<Предложение(?:\s[^>]*)?>([\s\S]*?)<\/Предложение>/gi;
  let m: RegExpExecArray | null;
  while ((m = offerRe.exec(xml))) {
    const block = m[1]!;
    const onecIdRaw = tagText(block, 'Ид');
    if (!onecIdRaw) continue;
    // Вариант CommerceML: uuid#uuid → берём левую часть (номенклатура / характеристика)
    const onecId = onecIdRaw.split('#')[0]!.trim();
    if (!onecId) continue;

    const priceBlock = tagText(block, 'Цены') ?? block;
    const price = parseNumber(tagText(priceBlock, 'ЦенаЗаЕдиницу'));
    const quantity = parseNumber(tagText(block, 'Количество'));

    offers.push({
      onecId,
      name: tagText(block, 'Наименование'),
      sku: tagText(block, 'Артикул'),
      barcode: tagText(block, 'Штрихкод'),
      price: price != null ? Math.round(price) : null,
      quantity: quantity != null ? Math.max(0, Math.floor(quantity)) : null,
    });
  }
  return offers;
}

export function isOffersFilename(filename: string): boolean {
  const n = filename.toLowerCase();
  return n.includes('offer') || n.includes('price') || n.includes('rests');
}
