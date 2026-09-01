#!/usr/bin/env node
/**
 * Phase 2 — Saleor → Jcos ETL (local).
 *
 * Default: --dry-run
 *   node migrate.mjs
 *   node migrate.mjs --apply --step=catalog   # tags + categories + products
 *   node migrate.mjs --apply --step=products  # force-active by default
 *   node migrate.mjs --apply --step=media     # download from prod GraphQL / local cache
 *   node migrate.mjs --apply --step=collections
 *   node migrate.mjs --apply --step=reviews
 *   node migrate.mjs --apply --step=category-covers
 *   node migrate.mjs --apply --step=blog
 *   node migrate.mjs --apply --step=hero
 *   node migrate.mjs --apply --step=delivery
 *   node migrate.mjs --apply --step=legal
 *   node migrate.mjs --apply --step=about
 *   node migrate.mjs --apply --step=faq
 *   node migrate.mjs --apply --step=users      # buyers (passwordHash=null → claim via password-reset)
 *   node migrate.mjs --apply --step=addresses  # UserAddress (needs users)
 *   node migrate.mjs --apply --step=quiz       # UserQuizResult from metadata.quiz_face_latest
 *   node migrate.mjs --apply --step=variant-dimensions  # weight + L/W/H + volume
 *   node migrate.mjs --apply --step=gratitude           # tiers, rules, photos
 *
 * Flags:
 *   --respect-published   keep Saleor is_published → active
 * Orders ETL: still parked.
 */
import {
  readFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const apply = process.argv.includes("--apply");
const stepArg = process.argv.find((a) => a.startsWith("--step="));
const step = stepArg ? stepArg.split("=")[1] : "all";
const CHANNEL_SLUG = process.env.SALEOR_CHANNEL || "miraflores-site";
/** Always import products as active (ignore Saleor is_published). */
const FORCE_ACTIVE = !process.argv.includes("--respect-published");
/** Optional placeholder stock when Saleor stock is 0 (default 0 = keep). */
const FORCE_STOCK = Number(process.env.ETL_FORCE_STOCK || "0");
const MEDIA_ROOT =
  process.env.SALEOR_MEDIA_ROOT ||
  join(__dirname, ".media-cache");
const MEDIA_BASE_URL = (
  process.env.SALEOR_MEDIA_BASE_URL ||
  "https://miraflores-shop.com/media"
).replace(/\/$/, "");
const MIRAFLORES_UPLOADS_DIR =
  process.env.MIRAFLORES_UPLOADS_DIR ||
  process.env.JCOS_UPLOADS_DIR ||
  join(__dirname, "../../backend/.data/local-uploads");
const MIRAFLORES_PUBLIC_URL = (
  process.env.MIRAFLORES_UPLOADS_PUBLIC_URL ||
  process.env.JCOS_UPLOADS_PUBLIC_URL ||
  "http://127.0.0.1:3001"
).replace(/\/$/, "");
// legacy aliases used below
const JCOS_UPLOADS_DIR = MIRAFLORES_UPLOADS_DIR;
const JCOS_PUBLIC_URL = MIRAFLORES_PUBLIC_URL;

const saleorUrl =
  process.env.SALEOR_DATABASE_URL ||
  "postgresql://saleor:saleor@localhost:5432/saleor_etl";
const jcosUrl =
  process.env.MIRAFLORES_DATABASE_URL ||
  process.env.JCOS_DATABASE_URL ||
  "postgresql://miraflores:miraflores@localhost:5432/miraflores";

const saleor = new pg.Client({ connectionString: saleorUrl });
const jcos = new pg.Client({ connectionString: jcosUrl });
await saleor.connect();
if (apply) {
  await jcos.connect();
  // FORCE RLS on User / UserAddress — ETL needs session bypass
  await jcos.query(`SELECT set_config('app.rls_bypass', 'on', false)`);
}

function careTagSlug(avSlug) {
  return `care-stage-${avSlug}`;
}

function newId() {
  return (
    "c" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 12)
  );
}

/**
 * Saleor media path from Editor.js / attribute URL.
 * @param {string} urlOrPath
 * @returns {string|null}
 */
function mediaRelFromUrl(urlOrPath) {
  const s = String(urlOrPath || "").trim();
  if (!s) return null;
  const bases = [
    MEDIA_BASE_URL,
    "https://miraflores-shop.com/media",
    "http://miraflores-shop.com/media",
  ];
  for (const b of bases) {
    if (s === b || s.startsWith(`${b}/`)) {
      return s.slice(b.length).replace(/^\//, "");
    }
  }
  const m = s.match(/\/media\/(.+)$/i);
  if (m) return m[1];
  if (/^https?:\/\//i.test(s)) return null;
  return s.replace(/^\//, "");
}

/** Editor.js → HTML (включая image-блоки; URL медиа — как в Saleor, без копирования). */
function editorJsToHtml(raw) {
  if (raw == null) return null;
  let data = raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    if (t.startsWith("<")) return t;
    try {
      data = JSON.parse(t);
    } catch {
      return `<p>${escapeHtml(t)}</p>`;
    }
  }
  if (!data || typeof data !== "object") return null;
  if (!Array.isArray(data.blocks)) {
    if (typeof data.text === "string") return `<p>${data.text}</p>`;
    return null;
  }
  const parts = [];
  for (const b of data.blocks) {
    const text = b?.data?.text ?? "";
    const type = b?.type || "paragraph";
    if (type === "header") {
      const lvl = Math.min(Math.max(Number(b.data?.level) || 2, 1), 4);
      parts.push(`<h${lvl}>${text}</h${lvl}>`);
    } else if (type === "list") {
      const items = b.data?.items || [];
      const tag = b.data?.style === "ordered" ? "ol" : "ul";
      parts.push(
        `<${tag}>${items.map((i) => `<li>${typeof i === "string" ? i : i?.content || ""}</li>`).join("")}</${tag}>`,
      );
    } else if (type === "quote") {
      if (text) parts.push(`<blockquote>${text}</blockquote>`);
    } else if (type === "image") {
      const src = String(b?.data?.file?.url || b?.data?.url || "").trim();
      if (!src) continue;
      const caption = String(b?.data?.caption || "").trim();
      const alt = escapeHtml(caption || "");
      let block = `<figure><img src="${escapeHtml(src)}" alt="${alt}" loading="lazy" />`;
      if (caption) block += `<figcaption>${caption}</figcaption>`;
      block += `</figure>`;
      parts.push(block);
    } else if (type === "delimiter") {
      parts.push("<hr />");
    } else if (text) {
      parts.push(`<p>${text}</p>`);
    }
  }
  const html = parts.join("\n").trim();
  return html || null;
}

/**
 * Editor.js → HTML + копирование inline-картинок в Jcos uploads.
 * @param {unknown} raw
 * @param {string} slug
 */
async function editorJsToHtmlWithLocalMedia(raw, slug) {
  if (raw == null) return null;
  let data = raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    if (t.startsWith("<")) {
      return relocateHtmlMediaUrls(t, slug);
    }
    try {
      data = JSON.parse(t);
    } catch {
      return `<p>${escapeHtml(t)}</p>`;
    }
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.blocks)) {
    return editorJsToHtml(raw);
  }

  const parts = [];
  let imageIndex = 0;
  let copied = 0;
  for (const b of data.blocks) {
    const text = b?.data?.text ?? "";
    const type = b?.type || "paragraph";
    if (type === "header") {
      const lvl = Math.min(Math.max(Number(b.data?.level) || 2, 1), 4);
      parts.push(`<h${lvl}>${text}</h${lvl}>`);
    } else if (type === "list") {
      const items = b.data?.items || [];
      const tag = b.data?.style === "ordered" ? "ol" : "ul";
      parts.push(
        `<${tag}>${items.map((i) => `<li>${typeof i === "string" ? i : i?.content || ""}</li>`).join("")}</${tag}>`,
      );
    } else if (type === "quote") {
      if (text) parts.push(`<blockquote>${text}</blockquote>`);
    } else if (type === "image") {
      const srcRaw = String(b?.data?.file?.url || b?.data?.url || "").trim();
      if (!srcRaw) continue;
      const rel = mediaRelFromUrl(srcRaw);
      let src = srcRaw;
      if (rel) {
        const destRel = join(
          "blog",
          "etl",
          "body",
          slug,
          `img-${imageIndex}${safeExt(rel)}`,
        );
        const local = await resolveMediaFile(rel, destRel, "blog-body");
        if (local) {
          src = local;
          copied++;
        } else {
          console.warn(`  [blog-body] skip image ${slug} #${imageIndex}: ${rel}`);
          continue;
        }
      }
      imageIndex++;
      const caption = String(b?.data?.caption || "").trim();
      const alt = escapeHtml(caption || "");
      let block = `<figure><img src="${escapeHtml(src)}" alt="${alt}" loading="lazy" />`;
      if (caption) block += `<figcaption>${caption}</figcaption>`;
      block += `</figure>`;
      parts.push(block);
    } else if (type === "delimiter") {
      parts.push("<hr />");
    } else if (text) {
      parts.push(`<p>${text}</p>`);
    }
  }
  if (copied) console.log(`  [blog-body] ${slug}: copied ${copied} inline image(s)`);
  const html = parts.join("\n").trim();
  return html || null;
}

/** Rewrite <img src> in already-HTML bodies (Saleor media → local uploads). */
async function relocateHtmlMediaUrls(html, slug) {
  const re = /(<img\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)\2/gi;
  const matches = [...String(html).matchAll(re)];
  if (!matches.length) return html;
  let out = String(html);
  let i = 0;
  for (const m of matches) {
    const src = m[3];
    const rel = mediaRelFromUrl(src);
    if (!rel) continue;
    const destRel = join("blog", "etl", "body", slug, `html-${i}${safeExt(rel)}`);
    const local = await resolveMediaFile(rel, destRel, "blog-body");
    i++;
    if (!local) continue;
    out = out.split(src).join(local);
  }
  return out;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseVolumeMl(name) {
  if (!name) return null;
  // мл → volumeMl; «г» не пишем в volumeMl (это не миллилитры)
  const m = String(name).match(/(\d+(?:[.,]\d+)?)\s*мл/i);
  if (!m) return null;
  return Math.round(Number(m[1].replace(",", ".")));
}

/** Saleor иногда кладёт в name base64 Global ID (ProductVariant:…). */
function isOpaqueSaleorVariantName(name) {
  return /^UHJvZHVjdFZhcmlhbnQ/i.test(String(name || "").trim());
}

/**
 * Название варианта: объём / осмысленное name / «Стандарт».
 * Не копируем название товара — на витрине это выглядит как дубль.
 */
function resolveVariantName(v, productName) {
  const vol = v.volume_name && String(v.volume_name).trim();
  if (vol) return vol;
  const n = v.name && String(v.name).trim();
  if (
    n &&
    !isOpaqueSaleorVariantName(n) &&
    n.toLowerCase() !== String(productName || "").trim().toLowerCase()
  ) {
    return n;
  }
  return "Стандарт";
}

function rubles(amount) {
  if (amount == null) return 0;
  return Math.max(0, Math.round(Number(amount)));
}

async function ensureEtlMap() {
  await jcos.query(`
    CREATE TABLE IF NOT EXISTS "_EtlIdMap" (
      entity TEXT NOT NULL,
      "saleorId" TEXT NOT NULL,
      "jcosId" TEXT NOT NULL,
      PRIMARY KEY (entity, "saleorId")
    )
  `);
}

async function mapGet(entity, saleorId) {
  const { rows } = await jcos.query(
    `SELECT "jcosId" FROM "_EtlIdMap" WHERE entity = $1 AND "saleorId" = $2`,
    [entity, String(saleorId)],
  );
  return rows[0]?.jcosId || null;
}

async function mapSet(entity, saleorId, jcosId) {
  await jcos.query(
    `INSERT INTO "_EtlIdMap" (entity, "saleorId", "jcosId")
     VALUES ($1, $2, $3)
     ON CONFLICT (entity, "saleorId") DO UPDATE SET "jcosId" = EXCLUDED."jcosId"`,
    [entity, String(saleorId), jcosId],
  );
}

async function upsertBySlug(table, slug, insertCols, insertVals, updateSql, updateVals) {
  const existing = await jcos.query(
    `SELECT id FROM "${table}" WHERE slug = $1`,
    [slug],
  );
  if (existing.rows[0]) {
    if (updateSql) {
      await jcos.query(updateSql, updateVals);
    }
    return existing.rows[0].id;
  }
  const id = newId();
  const cols = ["id", ...insertCols];
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  await jcos.query(
    `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")})
     VALUES (${placeholders})`,
    [id, ...insertVals],
  );
  return id;
}

// ─── tags ───────────────────────────────────────────────

async function planTags() {
  const { rows } = await saleor.query(`
    SELECT av.slug, av.name, COALESCE(av.sort_order, 0) AS sort_order
    FROM attribute_attribute a
    JOIN attribute_attributevalue av ON av.attribute_id = a.id
    WHERE a.slug = 'care_stage'
    ORDER BY sort_order, av.slug
  `);
  console.log(`\n[tags] care_stage values: ${rows.length}`);
  for (const r of rows) {
    console.log(`  → ${careTagSlug(r.slug)} | ${r.name}`);
  }
  return rows;
}

async function applyTags() {
  const rows = await planTags();
  await ensureEtlMap();
  let n = 0;
  for (const r of rows) {
    const slug = careTagSlug(r.slug);
    const id = await upsertBySlug(
      "CatalogTag",
      slug,
      ["slug", "name", "sortOrder", "createdAt", "updatedAt"],
      [slug, r.name, r.sort_order, new Date(), new Date()],
      `UPDATE "CatalogTag" SET name = $2, "sortOrder" = $3, "updatedAt" = NOW() WHERE slug = $1`,
      [slug, r.name, r.sort_order],
    );
    await mapSet("CatalogTag", r.slug, id);
    n++;
  }
  console.log(`[tags] upserted ${n}`);
}

// ─── categories ─────────────────────────────────────────

async function planCategories() {
  const { rows } = await saleor.query(`
    SELECT id, slug, name, parent_id, level, lft
    FROM product_category
    ORDER BY tree_id, lft
  `);
  console.log(`\n[categories] ${rows.length}`);
  return rows;
}

async function applyCategories() {
  const rows = await planCategories();
  await ensureEtlMap();

  // uncateg fallback
  const uncatId = await upsertBySlug(
    "Category",
    "uncategorized",
    ["slug", "name", "sortOrder", "createdAt", "updatedAt"],
    ["uncategorized", "Без категории", 9999, new Date(), new Date()],
    `UPDATE "Category" SET name = $2, "updatedAt" = NOW() WHERE slug = $1`,
    ["uncategorized", "Без категории"],
  );
  await mapSet("Category", "__uncategorized__", uncatId);

  // pass 1: create/update without parent
  const idBySaleor = new Map();
  let sort = 0;
  for (const r of rows) {
    const jid = await upsertBySlug(
      "Category",
      r.slug,
      ["slug", "name", "sortOrder", "createdAt", "updatedAt"],
      [r.slug, r.name, sort++, new Date(), new Date()],
      `UPDATE "Category" SET name = $2, "sortOrder" = $3, "updatedAt" = NOW() WHERE slug = $1`,
      [r.slug, r.name, sort - 1],
    );
    idBySaleor.set(r.id, jid);
    await mapSet("Category", r.id, jid);
  }

  // pass 2: parents
  let linked = 0;
  for (const r of rows) {
    if (!r.parent_id) continue;
    const child = idBySaleor.get(r.id);
    const parent = idBySaleor.get(r.parent_id);
    if (!child || !parent) continue;
    await jcos.query(
      `UPDATE "Category" SET "parentId" = $2, "updatedAt" = NOW() WHERE id = $1`,
      [child, parent],
    );
    linked++;
  }
  console.log(`[categories] upserted ${rows.length}, parents linked ${linked}`);
}

// ─── products ───────────────────────────────────────────

async function loadAttrMap() {
  const { rows } = await saleor.query(`
    SELECT
      apav.product_id,
      a.slug AS attr_slug,
      av.slug AS value_slug,
      av.name,
      av.plain_text,
      av.rich_text
    FROM attribute_assignedproductattributevalue apav
    JOIN attribute_attributevalue av ON av.id = apav.value_id
    JOIN attribute_attribute a ON a.id = av.attribute_id
  `);
  /** @type {Map<number, Record<string, any[]>>} */
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.product_id)) map.set(r.product_id, {});
    const bag = map.get(r.product_id);
    if (!bag[r.attr_slug]) bag[r.attr_slug] = [];
    bag[r.attr_slug].push(r);
  }
  return map;
}

function pickText(attrs, slug) {
  const list = attrs?.[slug];
  if (!list?.length) return null;
  const v = list[0];
  return (
    editorJsToHtml(v.rich_text) ||
    (v.plain_text ? `<p>${escapeHtml(v.plain_text)}</p>` : null) ||
    (v.name && v.name.length < 240 && !v.rich_text
      ? `<p>${escapeHtml(v.name)}</p>`
      : null)
  );
}

function pickPlain(attrs, slug) {
  const list = attrs?.[slug];
  if (!list?.length) return null;
  const v = list[0];
  if (v.plain_text) return v.plain_text.slice(0, 2000);
  if (v.name && !v.rich_text) return v.name.slice(0, 2000);
  const html = editorJsToHtml(v.rich_text);
  if (!html) return null;
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

async function planProducts() {
  const { rows } = await saleor.query(`
    SELECT
      p.id, p.slug, p.name, p.category_id, p.description,
      (SELECT COUNT(*) FROM product_productvariant v WHERE v.product_id = p.id) AS variants,
      (SELECT COUNT(*) FROM product_productvariant v
         WHERE v.product_id = p.id AND (v.sku IS NULL OR btrim(v.sku) = '')) AS no_sku
    FROM product_product p
    ORDER BY p.slug
  `);
  console.log(`\n[products] ${rows.length}`);
  console.log(`  without category: ${rows.filter((r) => !r.category_id).length}`);
  console.log(
    `  variants without sku: ${rows.reduce((s, r) => s + Number(r.no_sku), 0)}`,
  );
  return rows;
}

async function applyProducts() {
  await ensureEtlMap();
  const products = await planProducts();
  const attrs = await loadAttrMap();

  const { rows: chRows } = await saleor.query(
    `SELECT id FROM channel_channel WHERE slug = $1`,
    [CHANNEL_SLUG],
  );
  const channelId = chRows[0]?.id;
  if (!channelId) throw new Error(`Channel not found: ${CHANNEL_SLUG}`);

  const uncatId =
    (await mapGet("Category", "__uncategorized__")) ||
    (
      await jcos.query(`SELECT id FROM "Category" WHERE slug = 'uncategorized'`)
    ).rows[0]?.id;
  if (!uncatId) {
    throw new Error("Run --step=categories first (need uncategorized)");
  }

  const { rows: variants } = await saleor.query(
    `
    SELECT
      v.id, v.product_id, v.sku, v.name, v.track_inventory,
      COALESCE((
        SELECT ROUND(cl.price_amount)::int
        FROM product_productvariantchannellisting cl
        WHERE cl.variant_id = v.id AND cl.channel_id = $1
        LIMIT 1
      ), 0) AS price,
      COALESCE((
        SELECT ROUND(cl.prior_price_amount)::int
        FROM product_productvariantchannellisting cl
        WHERE cl.variant_id = v.id AND cl.channel_id = $1
          AND cl.prior_price_amount IS NOT NULL
        LIMIT 1
      ), NULL) AS compare_at,
      COALESCE((
        SELECT SUM(s.quantity - s.quantity_allocated)::int
        FROM warehouse_stock s WHERE s.product_variant_id = v.id
      ), 0) AS stock,
      (
        SELECT av.name
        FROM attribute_assignedvariantattribute ava
        JOIN attribute_assignedvariantattributevalue avav ON avav.assignment_id = ava.id
        JOIN attribute_attributevalue av ON av.id = avav.value_id
        JOIN attribute_attribute a ON a.id = av.attribute_id
        WHERE ava.variant_id = v.id AND a.slug = 'volume'
        LIMIT 1
      ) AS volume_name,
      (
        SELECT av.slug
        FROM attribute_assignedvariantattribute ava
        JOIN attribute_assignedvariantattributevalue avav ON avav.assignment_id = ava.id
        JOIN attribute_attributevalue av ON av.id = avav.value_id
        JOIN attribute_attribute a ON a.id = av.attribute_id
        WHERE ava.variant_id = v.id AND a.slug = 'volume'
        LIMIT 1
      ) AS volume_slug
    FROM product_productvariant v
    ORDER BY v.product_id, v.id
  `,
    [channelId],
  );

  const variantsByProduct = new Map();
  for (const v of variants) {
    if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, []);
    variantsByProduct.get(v.product_id).push(v);
  }

  const { rows: pubRows } = await saleor.query(
    `
    SELECT product_id, is_published
    FROM product_productchannellisting
    WHERE channel_id = $1
  `,
    [channelId],
  );
  const published = new Map(pubRows.map((r) => [r.product_id, r.is_published]));

  const usedSkus = new Set();
  {
    const { rows: existingSkus } = await jcos.query(
      `SELECT sku FROM "ProductVariant"`,
    );
    for (const r of existingSkus) usedSkus.add(r.sku);
  }

  function preferredSku(v) {
    const raw = v.sku && String(v.sku).trim();
    return (raw || `saleor-v${v.id}`).slice(0, 200);
  }

  /** Новый SKU только при INSERT; при UPDATE оставляем существующий. */
  function allocSku(preferred) {
    let base = String(preferred || "sku").slice(0, 200);
    let sku = base;
    let i = 2;
    while (usedSkus.has(sku)) {
      sku = `${base}-${i++}`.slice(0, 220);
    }
    usedSkus.add(sku);
    return sku;
  }

  let productN = 0;
  let variantN = 0;
  let tagLinks = 0;

  for (const p of products) {
    // Gift certificates live in GiftCertificateDenomination, not Product catalog.
    if (
      p.slug === "sertifikat" ||
      String(p.slug).startsWith("sertifikat-") ||
      String(p.slug).startsWith("podarochnyi-sertifikat")
    ) {
      continue;
    }
    const pa = attrs.get(p.id) || {};
    let categoryId = p.category_id
      ? await mapGet("Category", p.category_id)
      : uncatId;
    if (!categoryId) categoryId = uncatId;
    else {
      const { rows: catOk } = await jcos.query(
        `SELECT 1 FROM "Category" WHERE id = $1`,
        [categoryId],
      );
      if (!catOk[0]) categoryId = uncatId;
    }

    const shortDescription = pickPlain(pa, "product_card_description");
    const pageShortDescriptionHtml = pickText(pa, "short_description");
    const descriptionHtml = editorJsToHtml(p.description);
    const actionEffectHtml = pickText(pa, "action_effect");
    const applicationHtml = pickText(pa, "how_to_use");
    const compositionHtml = pickText(pa, "ingredients");
    const storageHtml = pickText(pa, "storage") || (pickPlain(pa, "storage")
      ? `<p>${escapeHtml(pickPlain(pa, "storage"))}</p>`
      : null);
    const importantNoteHtml = pickText(pa, "important_note");
    const mirafloresNoteHtml = pickText(pa, "miraflores_note");
    const productType = pickPlain(pa, "product_type");
    const purpose = pickPlain(pa, "purpose");
    const shelfLife = pickPlain(pa, "shelf_life");
    const extraHtml = null;
    const active = FORCE_ACTIVE
      ? true
      : published.has(p.id)
        ? Boolean(published.get(p.id))
        : true;

    const productId = await upsertBySlug(
      "Product",
      p.slug,
      [
        "slug",
        "name",
        "categoryId",
        "active",
        "shortDescription",
        "pageShortDescriptionHtml",
        "descriptionHtml",
        "actionEffectHtml",
        "applicationHtml",
        "compositionHtml",
        "importantNoteHtml",
        "mirafloresNoteHtml",
        "storageHtml",
        "productType",
        "purpose",
        "shelfLife",
        "extraHtml",
        "createdAt",
        "updatedAt",
      ],
      [
        p.slug,
        p.name,
        categoryId,
        active,
        shortDescription,
        pageShortDescriptionHtml,
        descriptionHtml,
        actionEffectHtml,
        applicationHtml,
        compositionHtml,
        importantNoteHtml,
        mirafloresNoteHtml,
        storageHtml,
        productType,
        purpose,
        shelfLife,
        extraHtml,
        new Date(),
        new Date(),
      ],
      `UPDATE "Product" SET
        name = $2, "categoryId" = $3, active = $4,
        "shortDescription" = $5, "pageShortDescriptionHtml" = $6, "descriptionHtml" = $7,
        "actionEffectHtml" = $8, "applicationHtml" = $9, "compositionHtml" = $10,
        "importantNoteHtml" = $11, "mirafloresNoteHtml" = $12, "storageHtml" = $13,
        "productType" = $14, purpose = $15, "shelfLife" = $16, "extraHtml" = $17,
        "updatedAt" = NOW()
       WHERE slug = $1`,
      [
        p.slug,
        p.name,
        categoryId,
        active,
        shortDescription,
        pageShortDescriptionHtml,
        descriptionHtml,
        actionEffectHtml,
        applicationHtml,
        compositionHtml,
        importantNoteHtml,
        mirafloresNoteHtml,
        storageHtml,
        productType,
        purpose,
        shelfLife,
        extraHtml,
      ],
    );
    await mapSet("Product", p.id, productId);
    productN++;

    // care_stage tags
    for (const cv of pa.care_stage || []) {
      const tagId = await mapGet("CatalogTag", cv.value_slug);
      if (!tagId) continue;
      await jcos.query(
        `INSERT INTO "ProductCatalogTag" ("productId", "tagId")
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [productId, tagId],
      );
      tagLinks++;
    }

    const pVariants = variantsByProduct.get(p.id) || [];
    const keepVariantIds = [];
    for (const v of pVariants) {
      const volumeMl = parseVolumeMl(v.volume_name);
      const vName = resolveVariantName(v, p.name);
      let vSlug =
        (v.volume_slug && String(v.volume_slug).trim()) ||
        `v-${v.id}`;
      vSlug = vSlug.slice(0, 120);
      const wantSku = preferredSku(v);
      const price = rubles(v.price);
      const compareAt =
        v.compare_at != null ? rubles(v.compare_at) : null;
      const stockRaw = Math.max(0, Number(v.stock) || 0);
      const stock =
        FORCE_STOCK > 0 ? Math.max(stockRaw, FORCE_STOCK) : stockRaw;

      // 1) IdMap  2) preferred SKU  3) productId+slug — иначе INSERT
      let variantId = await mapGet("ProductVariant", v.id);
      if (!variantId) {
        const bySku = await jcos.query(
          `SELECT id, sku FROM "ProductVariant" WHERE sku = $1`,
          [wantSku],
        );
        if (bySku.rows[0]) variantId = bySku.rows[0].id;
      }
      if (!variantId) {
        const bySlug = await jcos.query(
          `SELECT id FROM "ProductVariant" WHERE "productId" = $1 AND slug = $2`,
          [productId, vSlug],
        );
        if (bySlug.rows[0]) variantId = bySlug.rows[0].id;
      }

      if (variantId) {
        const { rows: cur } = await jcos.query(
          `SELECT sku, slug FROM "ProductVariant" WHERE id = $1`,
          [variantId],
        );
        const curSku = cur[0]?.sku;
        const curSlug = cur[0]?.slug;
        // unique (productId, slug): не трогаем slug, если целевой занят другим
        let slugTry = vSlug;
        if (curSlug !== vSlug) {
          const clash = await jcos.query(
            `SELECT 1 FROM "ProductVariant" WHERE "productId" = $1 AND slug = $2 AND id <> $3`,
            [productId, vSlug, variantId],
          );
          if (clash.rows[0]) slugTry = curSlug;
        }
        // SKU: вернуть «чистый» wantSku, если свободен; иначе оставить текущий
        let nextSku = curSku;
        if (curSku !== wantSku && !usedSkus.has(wantSku)) {
          nextSku = wantSku;
        }
        if (curSku && curSku !== nextSku) usedSkus.delete(curSku);
        usedSkus.add(nextSku);

        await jcos.query(
          `UPDATE "ProductVariant" SET
            "productId" = $2, name = $3, slug = $4, sku = $5, "volumeMl" = $6,
            price = $7, "compareAt" = $8, stock = $9, active = true, "updatedAt" = NOW()
           WHERE id = $1`,
          [
            variantId,
            productId,
            vName,
            slugTry,
            nextSku,
            volumeMl,
            price,
            compareAt,
            stock,
          ],
        );
      } else {
        let slugTry = vSlug;
        let n = 2;
        while (true) {
          const clash = await jcos.query(
            `SELECT 1 FROM "ProductVariant" WHERE "productId" = $1 AND slug = $2`,
            [productId, slugTry],
          );
          if (!clash.rows[0]) break;
          slugTry = `${vSlug}-${n++}`.slice(0, 120);
        }
        const sku = allocSku(wantSku);
        variantId = newId();
        await jcos.query(
          `INSERT INTO "ProductVariant" (
            id, "productId", name, slug, sku, "volumeMl", price, "compareAt",
            stock, "stockReserve", active, "orderMinQty", "createdAt", "updatedAt"
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,0,true,1,NOW(),NOW()
          )`,
          [
            variantId,
            productId,
            vName,
            slugTry,
            sku,
            volumeMl,
            price,
            compareAt,
            stock,
          ],
        );
      }
      await mapSet("ProductVariant", v.id, variantId);
      keepVariantIds.push(variantId);
      variantN++;
    }

    // Убрать сироты/дубли прошлых прогонов ETL у этого товара
    if (keepVariantIds.length) {
      await jcos.query(
        `DELETE FROM "ProductVariant"
         WHERE "productId" = $1 AND NOT (id = ANY($2::text[]))`,
        [productId, keepVariantIds],
      );
    } else {
      await jcos.query(`DELETE FROM "ProductVariant" WHERE "productId" = $1`, [
        productId,
      ]);
    }
  }

  console.log(
    `[products] upserted products=${productN} variants=${variantN} careTagLinks=${tagLinks} forceActive=${FORCE_ACTIVE}`,
  );
}

// ─── variant dimensions (Saleor weight + metadata.dimensions) ───

function parseVariantDimensions(weight, metadataRaw) {
  /** @type {Record<string, string>} */
  let meta = {};
  if (metadataRaw != null && metadataRaw !== "\\N") {
    try {
      meta =
        typeof metadataRaw === "string"
          ? JSON.parse(metadataRaw)
          : metadataRaw;
    } catch {
      meta = {};
    }
  }

  const weightNum =
    weight != null && weight !== "\\N" && String(weight).trim() !== ""
      ? Number(weight)
      : NaN;
  const weightGrams = Number.isFinite(weightNum)
    ? Math.max(0, Math.round(weightNum))
    : null;

  function dimMm(key) {
    const raw = meta[key];
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  const lengthMm = dimMm("dimensions.length_mm");
  const widthMm = dimMm("dimensions.width_mm");
  const heightMm = dimMm("dimensions.height_mm");

  let packageVolume = null;
  const volM3 = meta["dimensions.volume_m3"];
  if (volM3 != null && volM3 !== "" && Number(volM3) > 0) {
    packageVolume = Number(volM3) * 1000;
  } else if (lengthMm && widthMm && heightMm) {
    packageVolume = (lengthMm * widthMm * heightMm) / 1_000_000;
  }

  return { weightGrams, lengthMm, widthMm, heightMm, packageVolume };
}

async function planVariantDimensions() {
  const { rows } = await saleor.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE weight IS NOT NULL
          OR COALESCE(metadata::text, '') LIKE '%dimensions%'
      )::int AS with_data
    FROM product_productvariant
  `);
  console.log(
    `\n[variant-dimensions] saleor variants total=${rows[0].total} with weight/dims=${rows[0].with_data}`,
  );
}

async function applyVariantDimensions() {
  await ensureEtlMap();
  await planVariantDimensions();

  const { rows } = await saleor.query(`
    SELECT id, weight, metadata
    FROM product_productvariant
    ORDER BY id
  `);

  let updated = 0;
  let skipped = 0;
  let missingMap = 0;

  for (const v of rows) {
    const dims = parseVariantDimensions(v.weight, v.metadata);
    const hasAny =
      dims.weightGrams != null ||
      dims.lengthMm != null ||
      dims.widthMm != null ||
      dims.heightMm != null ||
      dims.packageVolume != null;
    if (!hasAny) {
      skipped++;
      continue;
    }

    const variantId = await mapGet("ProductVariant", v.id);
    if (!variantId) {
      missingMap++;
      continue;
    }

    await jcos.query(
      `UPDATE "ProductVariant" SET
        "weightGrams" = COALESCE($2, "weightGrams"),
        "lengthMm" = COALESCE($3, "lengthMm"),
        "widthMm" = COALESCE($4, "widthMm"),
        "heightMm" = COALESCE($5, "heightMm"),
        "packageVolume" = COALESCE($6, "packageVolume"),
        "updatedAt" = NOW()
       WHERE id = $1`,
      [
        variantId,
        dims.weightGrams,
        dims.lengthMm,
        dims.widthMm,
        dims.heightMm,
        dims.packageVolume,
      ],
    );
    updated++;
  }

  console.log(
    `[variant-dimensions] updated=${updated} skipped=${skipped} missingMap=${missingMap}`,
  );
}

function safeExt(urlOrPath) {
  const clean = String(urlOrPath).split("?")[0];
  const e = extname(clean).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(e)) return e;
  return ".jpg";
}

async function downloadTo(url, destPath) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, buf);
  return buf.length;
}

async function fetchProdMediaBySlug() {
  const gql =
    process.env.SALEOR_GRAPHQL_URL || "https://miraflores-shop.com/graphql/";
  /** @type {Map<string, string[]>} */
  const map = new Map();
  let after = null;
  for (let page = 0; page < 50; page++) {
    const query = `{
      products(first: 50, channel: "${CHANNEL_SLUG}"${after ? `, after: "${after}"` : ""}) {
        pageInfo { hasNextPage endCursor }
        edges { node { slug media { url type } } }
      }
    }`;
    const res = await fetch(gql, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(`GraphQL: ${json.errors[0].message}`);
    }
    const conn = json.data.products;
    for (const edge of conn.edges) {
      const urls = (edge.node.media || [])
        .filter((m) => m?.url)
        .map((m) => m.url);
      if (urls.length) map.set(edge.node.slug, urls);
    }
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return map;
}

async function planMedia() {
  const { rows } = await saleor.query(`
    SELECT COUNT(*)::int AS n FROM product_productmedia WHERE image IS NOT NULL AND btrim(image) <> ''
  `);
  console.log(`\n[media] dump rows with image path: ${rows[0].n}`);
  console.log(`  local cache: ${MEDIA_ROOT}`);
  console.log(`  public base: ${MEDIA_BASE_URL}`);
  console.log(`  jcos uploads: ${JCOS_UPLOADS_DIR}`);
}

async function applyMedia() {
  await ensureEtlMap();
  await planMedia();

  const { rows: products } = await jcos.query(`
    SELECT m."saleorId", m."jcosId", p.slug
    FROM "_EtlIdMap" m
    JOIN "Product" p ON p.id = m."jcosId"
    WHERE m.entity = 'Product'
  `);
  const slugToProduct = new Map(products.map((r) => [r.slug, r]));

  /** @type {Map<string, string[]>} */
  let prodMedia = new Map();
  if (process.env.ETL_SKIP_GRAPHQL_MEDIA === "1") {
    console.log(`[media] GraphQL skipped (ETL_SKIP_GRAPHQL_MEDIA=1)`);
  } else {
    console.log(
      `[media] fetching prod GraphQL media for channel ${CHANNEL_SLUG}…`,
    );
    try {
      prodMedia = await fetchProdMediaBySlug();
      console.log(`[media] prod products with media: ${prodMedia.size}`);
    } catch (e) {
      console.warn(
        `[media] GraphQL unavailable (${e.message || e}) — using dump + SALEOR_MEDIA_ROOT only`,
      );
    }
  }

  // dump paths as fallback
  const { rows: dumpMedia } = await saleor.query(`
    SELECT pm.id, pm.product_id, pm.image, COALESCE(pm.sort_order, 0) AS sort_order
    FROM product_productmedia pm
    WHERE pm.image IS NOT NULL AND btrim(pm.image) <> ''
    ORDER BY pm.product_id, sort_order, pm.id
  `);
  const dumpBySaleorProduct = new Map();
  for (const r of dumpMedia) {
    if (!dumpBySaleorProduct.has(r.product_id)) dumpBySaleorProduct.set(r.product_id, []);
    dumpBySaleorProduct.get(r.product_id).push(r);
  }

  let copied = 0;
  let downloaded = 0;
  let linked = 0;
  let missing = 0;
  const destRoot = join(JCOS_UPLOADS_DIR, "products", "etl");
  mkdirSync(destRoot, { recursive: true });

  for (const p of products) {
    const saleorId = Number(p.saleorId);
    /** @type {string[]} */
    let urls = prodMedia.get(p.slug) || [];
    /** @type {{src: string, from: string}[]} */
    const sources = [];

    if (urls.length) {
      for (const u of urls) sources.push({ src: u, from: "graphql" });
    } else {
      for (const row of dumpBySaleorProduct.get(saleorId) || []) {
        const local = join(MEDIA_ROOT, row.image);
        if (existsSync(local)) {
          sources.push({ src: local, from: "local" });
        } else {
          sources.push({
            src: `${MEDIA_BASE_URL}/${row.image.split("/").map(encodeURIComponent).join("/")}`,
            from: "http-dump",
          });
        }
      }
    }

    if (!sources.length) {
      missing++;
      continue;
    }

    // replace gallery for this product
    await jcos.query(`DELETE FROM "ProductImage" WHERE "productId" = $1`, [
      p.jcosId,
    ]);

    let sort = 0;
    for (const s of sources) {
      const fileName = `${p.slug}-${sort}${safeExt(s.src)}`;
      const destRel = join("products", "etl", fileName);
      const destAbs = join(JCOS_UPLOADS_DIR, destRel);
      try {
        if (s.from === "local") {
          mkdirSync(dirname(destAbs), { recursive: true });
          copyFileSync(s.src, destAbs);
          copied++;
        } else {
          await downloadTo(s.src, destAbs);
          downloaded++;
        }
      } catch (e) {
        console.warn(`  skip ${p.slug} #${sort}: ${e.message || e}`);
        continue;
      }
      const url = `${JCOS_PUBLIC_URL}/uploads/${destRel.replace(/\\/g, "/")}`;
      await jcos.query(
        `INSERT INTO "ProductImage" (id, "productId", url, "mediaType", "sortOrder", "createdAt")
         VALUES ($1, $2, $3, 'image', $4, NOW())`,
        [newId(), p.jcosId, url, sort],
      );
      linked++;
      sort++;
    }
  }

  console.log(
    `[media] linked=${linked} downloaded=${downloaded} copied=${copied} productsWithoutMedia=${missing}`,
  );
}

// ─── collections ────────────────────────────────────────

function editorJsToPlain(raw) {
  const html = editorJsToHtml(raw);
  if (!html) return null;
  const plain = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain || null;
}

async function planCollections() {
  const { rows: channelRows } = await saleor.query(
    `SELECT id FROM channel_channel WHERE slug = $1`,
    [CHANNEL_SLUG],
  );
  const channelId = channelRows[0]?.id;
  if (!channelId) {
    console.warn(`[collections] channel ${CHANNEL_SLUG} not found`);
    return [];
  }

  const { rows } = await saleor.query(
    `
    SELECT
      c.id,
      c.slug,
      c.name,
      c.description,
      c.background_image,
      COALESCE(cl.is_published, false) AS is_published,
      (
        SELECT COUNT(*)::int FROM product_collectionproduct cp
        WHERE cp.collection_id = c.id
      ) AS product_count
    FROM product_collection c
    LEFT JOIN product_collectionchannellisting cl
      ON cl.collection_id = c.id AND cl.channel_id = $1
    ORDER BY c.id
    `,
    [channelId],
  );

  console.log(`\n[collections] saleor: ${rows.length}`);
  for (const r of rows) {
    console.log(
      `  → ${r.slug} | ${r.name} | products=${r.product_count} | published=${r.is_published}`,
    );
  }
  return rows;
}

async function applyCollections() {
  const rows = await planCollections();
  await ensureEtlMap();

  // Replace existing seed / demo collections with dump.
  const delItems = await jcos.query(`DELETE FROM "CollectionItem"`);
  const delCols = await jcos.query(`DELETE FROM "Collection"`);
  console.log(
    `[collections] cleared jcos: collections=${delCols.rowCount} items=${delItems.rowCount}`,
  );

  let sortOrder = 0;
  let linked = 0;
  let missingProducts = 0;

  for (const r of rows) {
    const shortDescription = editorJsToPlain(r.description);
    const collectionId = await upsertBySlug(
      "Collection",
      r.slug,
      [
        "slug",
        "name",
        "shortDescription",
        "coverImageUrl",
        "productPreviewUrl",
        "active",
        "featuredLayout",
        "sortOrder",
        "createdAt",
        "updatedAt",
      ],
      [
        r.slug,
        r.name,
        shortDescription,
        null,
        null,
        Boolean(r.is_published),
        false,
        sortOrder,
        new Date(),
        new Date(),
      ],
      `UPDATE "Collection"
       SET name = $2, "shortDescription" = $3, active = $4, "sortOrder" = $5, "updatedAt" = NOW()
       WHERE slug = $1`,
      [r.slug, r.name, shortDescription, Boolean(r.is_published), sortOrder],
    );
    await mapSet("Collection", r.id, collectionId);

    const { rows: items } = await saleor.query(
      `
      SELECT p.slug AS product_slug, COALESCE(cp.sort_order, 0) AS sort_order
      FROM product_collectionproduct cp
      JOIN product_product p ON p.id = cp.product_id
      WHERE cp.collection_id = $1
      ORDER BY COALESCE(cp.sort_order, 999999), p.slug
      `,
      [r.id],
    );

    for (const item of items) {
      const { rows: prodRows } = await jcos.query(
        `SELECT id FROM "Product" WHERE slug = $1`,
        [item.product_slug],
      );
      const productId = prodRows[0]?.id;
      if (!productId) {
        missingProducts++;
        console.warn(`  skip item ${r.slug} → ${item.product_slug} (product missing)`);
        continue;
      }
      await jcos.query(
        `INSERT INTO "CollectionItem" (id, "collectionId", "productId", "sortOrder")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("collectionId", "productId") DO UPDATE
         SET "sortOrder" = EXCLUDED."sortOrder"`,
        [newId(), collectionId, productId, item.sort_order],
      );
      linked++;
    }

    console.log(`[collections] upserted ${r.slug} items=${items.length}`);
    sortOrder += 1;
  }

  console.log(
    `[collections] done collections=${rows.length} linked=${linked} missingProducts=${missingProducts}`,
  );
}

/**
 * Copy/download Saleor media into Jcos local uploads; return public URL.
 * @param {string} relPath Saleor relative path (e.g. category-backgrounds/x.png)
 * @param {string} destRel path under JCOS_UPLOADS_DIR
 * @param {string} [logTag]
 */
async function resolveMediaFile(relPath, destRel, logTag = "media") {
  const clean = String(relPath || "").trim();
  if (!clean) return null;

  const destAbs = join(JCOS_UPLOADS_DIR, destRel);
  mkdirSync(dirname(destAbs), { recursive: true });

  // Saleor file_url may already be percent-encoded; decode for local FS / re-encode for HTTP.
  const decoded = clean
    .split("/")
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join("/");

  const local = join(MEDIA_ROOT, decoded);
  try {
    if (existsSync(local)) {
      copyFileSync(local, destAbs);
    } else {
      const url = `${MEDIA_BASE_URL}/${decoded
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
      await downloadTo(url, destAbs);
    }
  } catch (e) {
    console.warn(`  [${logTag}] image skip ${clean}: ${e.message || e}`);
    return null;
  }
  return `${JCOS_PUBLIC_URL}/uploads/${destRel.replace(/\\/g, "/")}`;
}

async function resolveReviewImage(relPath, reviewUuid, slot) {
  const clean = String(relPath || "").trim();
  if (!clean) return null;
  const destRel = join(
    "reviews",
    "etl",
    `${reviewUuid}-${slot}${safeExt(clean)}`,
  );
  return resolveMediaFile(clean, destRel, "reviews");
}

// ─── category covers ────────────────────────────────────

async function planCategoryCovers() {
  const { rows } = await saleor.query(`
    SELECT slug, background_image
    FROM product_category
    WHERE NULLIF(btrim(COALESCE(background_image, '')), '') IS NOT NULL
    ORDER BY slug
  `);
  console.log(`\n[category-covers] saleor with cover=${rows.length}`);
  for (const r of rows) {
    console.log(`  ${r.slug} ← ${r.background_image}`);
  }
  return rows;
}

async function applyCategoryCovers() {
  const rows = await planCategoryCovers();
  let updated = 0;
  let missing = 0;
  let failed = 0;

  for (const r of rows) {
    const { rows: catRows } = await jcos.query(
      `SELECT id FROM "Category" WHERE slug = $1`,
      [r.slug],
    );
    if (!catRows[0]) {
      missing++;
      console.warn(`  [category-covers] skip ${r.slug}: no Category in jcos`);
      continue;
    }
    const destRel = join(
      "categories",
      "etl",
      `${r.slug}${safeExt(r.background_image)}`,
    );
    const url = await resolveMediaFile(r.background_image, destRel, "category-covers");
    if (!url) {
      failed++;
      continue;
    }
    await jcos.query(
      `UPDATE "Category" SET "coverImageUrl" = $2, "updatedAt" = NOW() WHERE id = $1`,
      [catRows[0].id, url],
    );
    updated++;
    console.log(`  [category-covers] ${r.slug} → ${url}`);
  }

  console.log(
    `[category-covers] updated=${updated} missing=${missing} failed=${failed}`,
  );
}

// ─── blog (Saleor page type ctatia) ──────────────────────

async function planBlog() {
  const { rows } = await saleor.query(`
    SELECT
      COUNT(*)::int AS n,
      COUNT(*) FILTER (WHERE p.is_published)::int AS published
    FROM page_page p
    JOIN page_pagetype pt ON pt.id = p.page_type_id
    WHERE pt.slug = 'ctatia'
  `);
  console.log(
    `\n[blog] saleor articles total=${rows[0].n} published=${rows[0].published}`,
  );
}

async function applyBlog() {
  await planBlog();

  const { rows } = await saleor.query(`
    SELECT
      p.id,
      p.slug,
      p.title,
      p.content,
      p.is_published,
      p.published_at,
      p.created_at,
      (
        SELECT av.file_url
        FROM attribute_assignedpageattributevalue apav
        JOIN attribute_attributevalue av ON av.id = apav.value_id
        JOIN attribute_attribute a ON a.id = av.attribute_id
        WHERE apav.page_id = p.id AND a.slug = 'prevyu-stati'
          AND NULLIF(btrim(COALESCE(av.file_url, '')), '') IS NOT NULL
        LIMIT 1
      ) AS preview_file,
      (
        SELECT av.file_url
        FROM attribute_assignedpageattributevalue apav
        JOIN attribute_attributevalue av ON av.id = apav.value_id
        JOIN attribute_attribute a ON a.id = av.attribute_id
        WHERE apav.page_id = p.id AND a.slug = 'kartinka'
          AND NULLIF(btrim(COALESCE(av.file_url, '')), '') IS NOT NULL
        LIMIT 1
      ) AS cover_file,
      (
        SELECT av.date_time
        FROM attribute_assignedpageattributevalue apav
        JOIN attribute_attributevalue av ON av.id = apav.value_id
        JOIN attribute_attribute a ON a.id = av.attribute_id
        WHERE apav.page_id = p.id AND a.slug = 'data'
        LIMIT 1
      ) AS attr_date
    FROM page_page p
    JOIN page_pagetype pt ON pt.id = p.page_type_id
    WHERE pt.slug = 'ctatia'
    ORDER BY COALESCE(p.published_at, p.created_at) ASC
  `);

  let upserted = 0;
  let images = 0;
  let sortOrder = 0;

  for (const r of rows) {
    const body =
      (await editorJsToHtmlWithLocalMedia(r.content, r.slug)) || "<p></p>";
    const excerpt = editorJsToPlain(r.content);
    const excerptShort =
      excerpt && excerpt.length > 400 ? `${excerpt.slice(0, 397)}…` : excerpt;

    const coverSrc = r.preview_file || r.cover_file;
    let coverUrl = null;
    if (coverSrc) {
      const destRel = join(
        "blog",
        "etl",
        `${r.slug}${safeExt(coverSrc)}`,
      );
      coverUrl = await resolveMediaFile(coverSrc, destRel, "blog");
      if (coverUrl) images++;
    }

    const publishedAt =
      r.attr_date || r.published_at || (r.is_published ? r.created_at : null);

    const { rows: existing } = await jcos.query(
      `SELECT id FROM "BlogPost" WHERE slug = $1`,
      [r.slug],
    );

    if (existing[0]) {
      await jcos.query(
        `UPDATE "BlogPost" SET
           title = $2,
           excerpt = $3,
           body = $4,
           "coverUrl" = COALESCE($5, "coverUrl"),
           "isPublished" = $6,
           "publishedAt" = $7,
           "sortOrder" = $8,
           "updatedAt" = NOW()
         WHERE id = $1`,
        [
          existing[0].id,
          r.title,
          excerptShort,
          body,
          coverUrl,
          Boolean(r.is_published),
          publishedAt,
          sortOrder,
        ],
      );
    } else {
      await jcos.query(
        `INSERT INTO "BlogPost" (
           id, slug, title, excerpt, body, "coverUrl",
           "isPublished", "publishedAt", "sortOrder", "createdAt", "updatedAt"
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          newId(),
          r.slug,
          r.title,
          excerptShort,
          body,
          coverUrl,
          Boolean(r.is_published),
          publishedAt,
          sortOrder,
          r.created_at || new Date(),
          new Date(),
        ],
      );
    }
    upserted++;
    sortOrder += 1;
    console.log(`  [blog] ${r.slug}${coverUrl ? " +cover" : ""}`);
  }

  console.log(`[blog] upserted=${upserted} covers=${images}`);
}

// ─── hero slider (Saleor page slaider / type hero-claider) ─

async function planHero() {
  const { rows } = await saleor.query(`
    SELECT a.slug AS attr, av.file_url
    FROM page_page p
    JOIN page_pagetype pt ON pt.id = p.page_type_id
    JOIN attribute_assignedpageattributevalue apav ON apav.page_id = p.id
    JOIN attribute_attributevalue av ON av.id = apav.value_id
    JOIN attribute_attribute a ON a.id = av.attribute_id
    WHERE pt.slug = 'hero-claider' AND p.slug = 'slaider'
      AND NULLIF(btrim(COALESCE(av.file_url, '')), '') IS NOT NULL
    ORDER BY a.slug
  `);
  console.log(`\n[hero] saleor file attrs=${rows.length}`);
  for (const r of rows) console.log(`  ${r.attr} ← ${r.file_url}`);
  return rows;
}

async function applyHero() {
  const attrs = await planHero();
  /** @type {Map<number, { large?: string, small?: string }>} */
  const slidesMap = new Map();

  for (const r of attrs) {
    const slug = String(r.attr || "");
    let n = 1;
    if (slug.includes("-2") || slug.endsWith("-2")) n = 2;
    else if (slug.includes("-3")) n = 3;
    else if (slug.includes("-4")) n = 4;
    else if (slug.includes("osnovnaya") || slug.includes("osnov")) n = 1;

    if (!slidesMap.has(n)) slidesMap.set(n, {});
    const slide = slidesMap.get(n);
    if (slug.includes("bolshaya") || slug.includes("large")) {
      slide.large = r.file_url;
    } else if (slug.includes("malenkaya") || slug.includes("small")) {
      slide.small = r.file_url;
    }
  }

  const ordered = [...slidesMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v)
    .filter((v) => v.large || v.small);

  if (ordered.length === 0) {
    console.warn("[hero] no slides found in Saleor");
    return;
  }

  await jcos.query(`DELETE FROM "HeroSlide"`);

  let i = 0;
  for (const s of ordered) {
    let imageUrl = null;
    let mobileImageUrl = null;
    if (s.large) {
      imageUrl = await resolveMediaFile(
        s.large,
        join("hero", "etl", `slide-${i}-large${safeExt(s.large)}`),
        "hero",
      );
    }
    if (s.small) {
      mobileImageUrl = await resolveMediaFile(
        s.small,
        join("hero", "etl", `slide-${i}-mobile${safeExt(s.small)}`),
        "hero",
      );
    }
    if (!imageUrl && !mobileImageUrl) {
      console.warn(`  [hero] skip slide ${i}: no images resolved`);
      i += 1;
      continue;
    }
    await jcos.query(
      `INSERT INTO "HeroSlide" (
         id, "imageUrl", "mobileImageUrl", "sortOrder", active, "createdAt", "updatedAt"
       ) VALUES ($1,$2,$3,$4,true,NOW(),NOW())`,
      [newId(), imageUrl || mobileImageUrl, mobileImageUrl, i],
    );
    console.log(`  [hero] slide ${i} ok`);
    i += 1;
  }

  console.log(`[hero] slides=${i}`);
}

// ─── delivery / progress-bar ─────────────────────────────

async function planDelivery() {
  const { rows } = await saleor.query(`
    SELECT
      p.content,
      (
        SELECT av.numeric
        FROM attribute_assignedpageattributevalue apav
        JOIN attribute_attributevalue av ON av.id = apav.value_id
        JOIN attribute_attribute a ON a.id = av.attribute_id
        WHERE apav.page_id = p.id AND a.slug = 'chislo-progress-bar-korziny'
        LIMIT 1
      ) AS threshold,
      (
        SELECT av.plain_text
        FROM attribute_assignedpageattributevalue apav
        JOIN attribute_attributevalue av ON av.id = apav.value_id
        JOIN attribute_attribute a ON a.id = av.attribute_id
        WHERE apav.page_id = p.id AND a.slug = 'uspeh-progress-bar-korziny'
        LIMIT 1
      ) AS success_text
    FROM page_page p
    WHERE p.slug = 'progress-bar-korziny'
    LIMIT 1
  `);
  const r = rows[0];
  if (!r) {
    console.log("\n[cart] saleor page progress-bar-korziny not found");
    return null;
  }
  const contentText = editorJsToPlain(r.content) || "до бесплатной доставки в ПВЗ";

  const { rows: textRows } = await saleor.query(`
    SELECT content FROM page_page WHERE slug = 'tekst-v-korzine' LIMIT 1
  `);
  const legalHtml = editorJsToHtml(textRows[0]?.content) || "<p></p>";

  console.log(
    `\n[cart] threshold=${r.threshold} content=${JSON.stringify(contentText)} success=${JSON.stringify(r.success_text)} legalLen=${legalHtml.length}`,
  );
  return {
    threshold: Number(r.threshold) || 10000,
    contentText,
    successText: (r.success_text || "Бесплатная доставка!").trim(),
    legalHtml,
  };
}

async function applyDelivery() {
  const data = await planDelivery();
  if (!data) return;
  await jcos.query(
    `INSERT INTO "CartSettings" (
       id, "freeShippingThresholdRub", "progressContentText", "progressSuccessText", "legalHtml", "updatedAt"
     ) VALUES ('default', $1, $2, $3, $4, NOW())
     ON CONFLICT (id) DO UPDATE SET
       "freeShippingThresholdRub" = EXCLUDED."freeShippingThresholdRub",
       "progressContentText" = EXCLUDED."progressContentText",
       "progressSuccessText" = EXCLUDED."progressSuccessText",
       "legalHtml" = EXCLUDED."legalHtml",
       "updatedAt" = NOW()`,
    [data.threshold, data.contentText, data.successText, data.legalHtml],
  );
  console.log("[cart] upserted CartSettings default");
}

// ─── legal CMS pages ────────────────────────────────────

const LEGAL_MAP = [
  {
    saleorSlug: "oferta-i-usloviia-polzovaniia",
    jcosSlug: "terms",
    fallbackTitle: "Оферта и условия пользования",
  },
  {
    saleorSlug: "politika-konfidentsialnosti",
    jcosSlug: "privacy",
    fallbackTitle: "Политика конфиденциальности",
  },
  {
    saleorSlug: "oplata-i-dostavka",
    jcosSlug: "delivery",
    fallbackTitle: "Оплата и доставка",
  },
];

async function planLegal() {
  const { rows } = await saleor.query(
    `
    SELECT p.slug, p.title, p.is_published
    FROM page_page p
    JOIN page_pagetype pt ON pt.id = p.page_type_id
    WHERE pt.slug = 'tekhnicheskie-stranitsy'
      AND p.slug = ANY($1::text[])
    ORDER BY p.slug
    `,
    [LEGAL_MAP.map((m) => m.saleorSlug)],
  );
  console.log(`\n[legal] saleor pages=${rows.length}`);
  for (const r of rows) console.log(`  ${r.slug} — ${r.title}`);
  return rows;
}

async function applyLegal() {
  await planLegal();
  let upserted = 0;
  for (const m of LEGAL_MAP) {
    const { rows } = await saleor.query(
      `
      SELECT p.title, p.content, p.is_published, p.published_at
      FROM page_page p
      WHERE p.slug = $1
      LIMIT 1
      `,
      [m.saleorSlug],
    );
    const r = rows[0];
    if (!r) {
      console.warn(`  [legal] skip ${m.jcosSlug}: saleor ${m.saleorSlug} missing`);
      continue;
    }
    const bodyHtml = editorJsToHtml(r.content) || "<p></p>";
    const title = r.title || m.fallbackTitle;
    await jcos.query(
      `INSERT INTO "CmsPage" (
         id, slug, title, "bodyHtml", "isPublished", "publishedAt", "createdAt", "updatedAt"
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         "bodyHtml" = EXCLUDED."bodyHtml",
         "isPublished" = EXCLUDED."isPublished",
         "publishedAt" = COALESCE(EXCLUDED."publishedAt", "CmsPage"."publishedAt"),
         "updatedAt" = NOW()`,
      [
        newId(),
        m.jcosSlug,
        title,
        bodyHtml,
        Boolean(r.is_published),
        r.published_at || new Date(),
      ],
    );
    upserted++;
    console.log(`  [legal] ${m.jcosSlug} ← ${m.saleorSlug}`);
  }
  console.log(`[legal] upserted=${upserted}`);
}

// ─── about CMS page (Saleor stranitsa-o-nas attributes) ───

const ABOUT_SALEOR_SLUG = "stranitsa-o-nas";
const ABOUT_JCOS_SLUG = "about";

async function planAbout() {
  const { rows } = await saleor.query(
    `
    SELECT p.slug, p.title, p.is_published, p.content IS NOT NULL AS has_content
    FROM page_page p
    WHERE p.slug = $1
    LIMIT 1
    `,
    [ABOUT_SALEOR_SLUG],
  );
  console.log(`\n[about] saleor page=${rows[0]?.slug || "missing"}`);
  if (rows[0]) {
    console.log(`  title=${rows[0].title} published=${rows[0].is_published}`);
  }
  const { rows: attrs } = await saleor.query(
    `
    SELECT a.slug, a.name, a.type
    FROM attribute_attributepage ap
    JOIN attribute_attribute a ON a.id = ap.attribute_id
    JOIN page_page p ON p.page_type_id = ap.page_type_id
    WHERE p.slug = $1
    ORDER BY a.slug
    `,
    [ABOUT_SALEOR_SLUG],
  );
  console.log(`  page-type attrs=${attrs.length}`);
  for (const a of attrs) console.log(`    ${a.slug} (${a.type})`);
}

async function applyAbout() {
  await planAbout();
  const { rows: pageRows } = await saleor.query(
    `
    SELECT p.id, p.title, p.is_published, p.published_at
    FROM page_page p
    WHERE p.slug = $1
    LIMIT 1
    `,
    [ABOUT_SALEOR_SLUG],
  );
  const page = pageRows[0];
  if (!page) {
    console.warn(`  [about] skip: saleor ${ABOUT_SALEOR_SLUG} missing`);
    return;
  }

  const { rows: vals } = await saleor.query(
    `
    SELECT
      a.slug AS attr_slug,
      av.file_url,
      av.rich_text,
      av.name AS value_name
    FROM attribute_assignedpageattributevalue apav
    JOIN attribute_attributevalue av ON av.id = apav.value_id
    JOIN attribute_attribute a ON a.id = av.attribute_id
    WHERE apav.page_id = $1
      AND (a.slug LIKE 'kartinka-o-nas-%' OR a.slug LIKE 'tekst-o-nas-%')
    `,
    [page.id],
  );

  /** @type {Record<number, { imageUrl?: string|null, html?: string|null }>} */
  const byIndex = {};
  for (const v of vals) {
    const m = String(v.attr_slug || "").match(/^(kartinka-o-nas|tekst-o-nas)-(\d+)$/);
    if (!m) continue;
    const kind = m[1];
    const index = Number(m[2]);
    if (!byIndex[index]) byIndex[index] = {};
    if (kind === "kartinka-o-nas" && v.file_url) {
      const destRel = join(
        "cms",
        "about",
        `block-${index}${safeExt(v.file_url)}`,
      );
      byIndex[index].imageUrl = await resolveMediaFile(
        v.file_url,
        destRel,
        "about",
      );
    }
    if (kind === "tekst-o-nas") {
      byIndex[index].html =
        editorJsToHtml(v.rich_text) ||
        (v.value_name ? `<p>${escapeHtml(String(v.value_name))}</p>` : null);
    }
  }

  const indices = Object.keys(byIndex)
    .map(Number)
    .filter((n) => byIndex[n].imageUrl || byIndex[n].html)
    .sort((a, b) => a - b);

  const parts = [];
  for (const i of indices) {
    const block = byIndex[i];
    parts.push(`<section class="about-block">`);
    if (block.imageUrl) {
      parts.push(
        `<p><img src="${escapeHtml(block.imageUrl)}" alt="" /></p>`,
      );
    }
    if (block.html) parts.push(block.html);
    parts.push(`</section>`);
  }

  const bodyHtml = parts.join("\n").trim() || "<p></p>";
  const title = page.title || "О нас";

  await jcos.query(
    `INSERT INTO "CmsPage" (
       id, slug, title, "bodyHtml", "isPublished", "publishedAt", "createdAt", "updatedAt"
     ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT (slug) DO UPDATE SET
       title = EXCLUDED.title,
       "bodyHtml" = EXCLUDED."bodyHtml",
       "isPublished" = EXCLUDED."isPublished",
       "publishedAt" = COALESCE(EXCLUDED."publishedAt", "CmsPage"."publishedAt"),
       "updatedAt" = NOW()`,
    [
      newId(),
      ABOUT_JCOS_SLUG,
      title === "Страница о нас" ? "О нас" : title,
      bodyHtml,
      Boolean(page.is_published),
      page.published_at || new Date(),
    ],
  );
  console.log(
    `  [about] ${ABOUT_JCOS_SLUG} ← ${ABOUT_SALEOR_SLUG} blocks=${indices.length} htmlLen=${bodyHtml.length}`,
  );
}

// ─── gratitude program (Saleor page programma-blagodarnosti) ───

const GRATITUDE_SALEOR_SLUG = "programma-blagodarnosti";
const GRATITUDE_ARTICLE_SLUG = "programma-blagodarnosti-2";

const GRATITUDE_TIER_SPECS = [
  {
    index: 1,
    title: "от 5 000₽",
    infoAttr: "informaciya-o-podarke-1",
    photoAttr: "foto-podarka",
    fallbackInfoHtml: "<p>1 гидролат (100&nbsp;мл.)</p>",
  },
  {
    index: 2,
    title: "от 10 000₽",
    infoAttr: "informaciya-o-podarke-2",
    photoAttr: "foto-podarka-2",
    fallbackInfoHtml: "<p>1 цветочный мист (100&nbsp;мл.)</p>",
  },
  {
    index: 3,
    title: "от 15 000₽",
    infoAttr: "informaciya-o-podarke-3",
    photoAttr: "foto-podarka-3",
    fallbackInfoHtml:
      "<p>1 концентрат Plasma Botanica Drops (10&nbsp;мл.)</p>",
  },
  {
    index: 4,
    title: "от 20 000₽",
    infoAttr: "informaciya-o-podarke-4",
    photoAttr: "foto-podarka-4",
    fallbackInfoHtml: "<p>набор всех 3 типов Подарков</p>",
  },
];

/** Cart gift rules aligned with legal page (page programma-blagodarnosti-2). */
const GRATITUDE_RULE_SPECS = [
  { minRub: 5000, maxRub: 9999, saleorVariantId: "542" },
  { minRub: 10000, maxRub: 14999, saleorVariantId: "543" },
  { minRub: 15000, maxRub: 19999, saleorVariantId: "624" },
];

function isGratitudePlaceholderInfo(html) {
  if (!html) return true;
  const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return (
    !plain ||
    plain.includes("Собственное производство") ||
    plain.includes("гидралатов, экстрактов")
  );
}

async function planGratitude() {
  const { rows } = await saleor.query(
    `
    SELECT p.id, p.slug, p.title
    FROM page_page p
    WHERE p.slug = $1
    LIMIT 1
    `,
    [GRATITUDE_SALEOR_SLUG],
  );
  console.log(
    `\n[gratitude] saleor page=${rows[0]?.slug || "missing"} title=${rows[0]?.title || ""}`,
  );
  if (rows[0]) {
    const { rows: attrs } = await saleor.query(
      `
      SELECT a.slug, a.type, NULLIF(btrim(COALESCE(av.file_url, '')), '') AS file_url
      FROM attribute_assignedpageattributevalue apav
      JOIN attribute_attributevalue av ON av.id = apav.value_id
      JOIN attribute_attribute a ON a.id = av.attribute_id
      WHERE apav.page_id = $1
        AND (
          a.slug LIKE 'informaciya-o-podarke-%'
          OR a.slug = 'foto-podarka'
          OR a.slug LIKE 'foto-podarka-%'
        )
      ORDER BY a.slug
      `,
      [rows[0].id],
    );
    console.log(`  attrs=${attrs.length}`);
    for (const a of attrs) {
      console.log(`    ${a.slug} (${a.type})${a.file_url ? " ← " + a.file_url : ""}`);
    }
  }
  const { rows: rules } = await saleor.query(`
    SELECT pr.name, pr.order_predicate,
      array_agg(rg.productvariant_id::text ORDER BY rg.productvariant_id) AS gift_variants
    FROM discount_promotionrule pr
    JOIN discount_promotion p ON p.id = pr.promotion_id
    LEFT JOIN discount_promotionrule_gifts rg ON rg.promotionrule_id = pr.id
    WHERE p.name ILIKE '%благодар%'
      AND pr.reward_type = 'gift'
    GROUP BY pr.id, pr.name, pr.order_predicate
    ORDER BY pr.name
  `);
  console.log(`  saleor promotion gift rules=${rules.length}`);
  for (const r of rules) {
    console.log(`    ${r.name} variants=${(r.gift_variants || []).filter(Boolean).join(",")}`);
  }
}

async function applyGratitude() {
  await ensureEtlMap();
  await planGratitude();

  const { rows: pageRows } = await saleor.query(
    `
    SELECT id, title
    FROM page_page
    WHERE slug = $1
    LIMIT 1
    `,
    [GRATITUDE_SALEOR_SLUG],
  );
  const page = pageRows[0];
  if (!page) {
    console.warn(`  [gratitude] skip: saleor page ${GRATITUDE_SALEOR_SLUG} missing`);
    return;
  }

  const { rows: attrRows } = await saleor.query(
    `
    SELECT
      a.slug AS attr_slug,
      av.file_url,
      av.rich_text,
      av.name AS value_name
    FROM attribute_assignedpageattributevalue apav
    JOIN attribute_attributevalue av ON av.id = apav.value_id
    JOIN attribute_attribute a ON a.id = av.attribute_id
    WHERE apav.page_id = $1
      AND (
        a.slug LIKE 'informaciya-o-podarke-%'
        OR a.slug = 'foto-podarka'
        OR a.slug LIKE 'foto-podarka-%'
      )
    `,
    [page.id],
  );

  /** @type {Map<string, { file_url?: string|null, rich_text?: unknown, value_name?: string|null }>} */
  const byAttr = new Map();
  for (const row of attrRows) {
    byAttr.set(row.attr_slug, row);
  }

  const tiers = [];
  let images = 0;
  for (const spec of GRATITUDE_TIER_SPECS) {
    const row = byAttr.get(spec.infoAttr);
    let infoHtml =
      editorJsToHtml(row?.rich_text) ||
      (row?.value_name
        ? `<p>${escapeHtml(String(row.value_name))}</p>`
        : null);
    if (isGratitudePlaceholderInfo(infoHtml)) {
      infoHtml = spec.fallbackInfoHtml;
    }

    const photoRow = byAttr.get(spec.photoAttr);
    let imageUrl = null;
    if (photoRow?.file_url) {
      const destRel = join(
        "rich",
        "gratitude",
        `tier-${spec.index}${safeExt(photoRow.file_url)}`,
      );
      imageUrl = await resolveMediaFile(photoRow.file_url, destRel, "gratitude");
      if (imageUrl) images++;
    }

    tiers.push({
      sortOrder: spec.index - 1,
      title: spec.title,
      infoHtml: infoHtml || spec.fallbackInfoHtml,
      imageUrl,
      active: true,
    });
    console.log(
      `  [gratitude] tier ${spec.index}: ${spec.title}${imageUrl ? " +photo" : ""}`,
    );
  }

  const rules = [];
  let rulesSkipped = 0;
  for (const spec of GRATITUDE_RULE_SPECS) {
    const variantId = await mapGet("ProductVariant", spec.saleorVariantId);
    if (!variantId) {
      console.warn(
        `  [gratitude] rule skip ${spec.minRub}-${spec.maxRub ?? "∞"}: variant ${spec.saleorVariantId} not mapped`,
      );
      rulesSkipped++;
      continue;
    }
    rules.push({
      minRub: spec.minRub,
      maxRub: spec.maxRub,
      variantId,
      active: true,
      sortOrder: rules.length,
    });
  }

  await jcos.query(`DELETE FROM "GratitudeGiftRule"`);
  await jcos.query(`DELETE FROM "GratitudeGiftTier"`);

  for (const t of tiers) {
    await jcos.query(
      `INSERT INTO "GratitudeGiftTier" (
        id, "sortOrder", title, "infoHtml", "imageUrl", active, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [newId(), t.sortOrder, t.title, t.infoHtml, t.imageUrl, t.active],
    );
  }

  for (const r of rules) {
    await jcos.query(
      `INSERT INTO "GratitudeGiftRule" (
        id, "minRub", "maxRub", "variantId", active, "sortOrder", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [
        newId(),
        r.minRub,
        r.maxRub,
        r.variantId,
        r.active,
        r.sortOrder,
      ],
    );
  }

  await jcos.query(
    `INSERT INTO "GratitudeProgramSettings" (id, "articleSlug", "updatedAt")
     VALUES ('default', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET
       "articleSlug" = EXCLUDED."articleSlug",
       "updatedAt" = NOW()`,
    [GRATITUDE_ARTICLE_SLUG],
  );

  console.log(
    `[gratitude] tiers=${tiers.length} rules=${rules.length} images=${images} rulesSkipped=${rulesSkipped} articleSlug=${GRATITUDE_ARTICLE_SLUG}`,
  );
}

// ─── FAQ ────────────────────────────────────────────────

async function planFaq() {
  const { rows } = await saleor.query(`
    SELECT COUNT(*)::int AS n
    FROM page_page p
    JOIN page_pagetype pt ON pt.id = p.page_type_id
    WHERE pt.slug = 'faq' AND p.is_published
  `);
  console.log(`\n[faq] saleor published=${rows[0].n}`);
}

async function applyFaq() {
  await planFaq();
  const { rows } = await saleor.query(`
    SELECT
      p.slug,
      p.title,
      p.content,
      p.metadata,
      (
        SELECT av.plain_text
        FROM attribute_assignedpageattributevalue apav
        JOIN attribute_attributevalue av ON av.id = apav.value_id
        JOIN attribute_attribute a ON a.id = av.attribute_id
        WHERE apav.page_id = p.id AND a.slug = 'faq-question'
        LIMIT 1
      ) AS question,
      (
        SELECT av.plain_text
        FROM attribute_assignedpageattributevalue apav
        JOIN attribute_attributevalue av ON av.id = apav.value_id
        JOIN attribute_attribute a ON a.id = av.attribute_id
        WHERE apav.page_id = p.id AND a.slug = 'faq-answer'
        LIMIT 1
      ) AS answer
    FROM page_page p
    JOIN page_pagetype pt ON pt.id = p.page_type_id
    WHERE pt.slug = 'faq' AND p.is_published
    ORDER BY p.slug
  `);

  const items = rows
    .map((r, i) => {
      let sortOrder = i;
      try {
        const meta =
          typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata;
        const so =
          meta?.sortOrder ??
          (Array.isArray(meta)
            ? meta.find((x) => x?.key === "sortOrder")?.value
            : undefined);
        if (so != null && Number.isFinite(Number(so))) sortOrder = Number(so);
      } catch {
        /* keep index */
      }
      const question = (r.question || r.title || "").trim();
      const answer =
        (r.answer || "").trim() || editorJsToPlain(r.content) || "";
      return { question, answer, sortOrder, slug: r.slug };
    })
    .filter((it) => it.question && it.answer)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug));

  await jcos.query(`DELETE FROM "FaqItem"`);
  let n = 0;
  for (const it of items) {
    await jcos.query(
      `INSERT INTO "FaqItem" (
         id, question, answer, "sortOrder", active, "createdAt", "updatedAt"
       ) VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
      [newId(), it.question, it.answer, n],
    );
    n += 1;
    console.log(`  [faq] ${it.slug}`);
  }
  console.log(`[faq] inserted=${n}`);
}

function metaGet(meta, key) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const v = meta[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function displayNameFromSaleor(firstName, lastName, email) {
  const name = [firstName, lastName]
    .map((x) => (x || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  if (name) return name;
  const local = String(email || "")
    .split("@")[0]
    ?.trim();
  return local || null;
}

async function planUsers() {
  const { rows } = await saleor.query(`
    SELECT
      COUNT(*)::int AS n,
      COUNT(*) FILTER (WHERE is_staff)::int AS staff,
      COUNT(*) FILTER (WHERE NOT is_staff)::int AS buyers,
      COUNT(*) FILTER (WHERE NOT is_staff AND is_active)::int AS buyers_active,
      COUNT(*) FILTER (
        WHERE NOT is_staff AND COALESCE(metadata->>'phone', '') <> ''
      )::int AS with_phone
    FROM account_user
  `);
  const r = rows[0];
  console.log(
    `\n[users] saleor total=${r.n} staff=${r.staff} buyers=${r.buyers} buyersActive=${r.buyers_active} withPhoneMeta=${r.with_phone}`,
  );
  console.log(
    "[users] note: passwordHash=null (пароли Saleor не переносим) → claim через password-reset",
  );
}

async function applyUsers() {
  await ensureEtlMap();
  await planUsers();

  const { rows } = await saleor.query(`
    SELECT
      u.id::text AS id,
      u.uuid::text AS uuid,
      lower(btrim(u.email)) AS email,
      u.first_name,
      u.last_name,
      u.is_active,
      u.is_confirmed,
      u.date_joined,
      u.updated_at,
      u.metadata,
      u.private_metadata
    FROM account_user u
    WHERE NOT u.is_staff
      AND btrim(u.email) <> ''
    ORDER BY u.id ASC
  `);

  let upserted = 0;
  let skippedStaffEmail = 0;
  let skippedBadEmail = 0;

  for (const r of rows) {
    const email = String(r.email || "")
      .trim()
      .toLowerCase();
    if (!email || !email.includes("@")) {
      skippedBadEmail++;
      continue;
    }

    const existing = await jcos.query(
      `SELECT id, role FROM "User" WHERE lower(email) = $1 LIMIT 1`,
      [email],
    );
    const ex = existing.rows[0];
    if (ex && (ex.role === "ADMIN" || ex.role === "MODERATOR")) {
      // Не затираем сотрудников админки тем же email
      await mapSet("User", r.id, ex.id);
      if (r.uuid) await mapSet("UserUuid", r.uuid, ex.id);
      skippedStaffEmail++;
      continue;
    }

    const phone = metaGet(r.metadata, "phone");
    const greetings = metaGet(r.metadata, "receiveGreetings");
    const marketingConsent =
      greetings === "true" || greetings === "1" || greetings === "yes";
    const displayName = displayNameFromSaleor(
      r.first_name,
      r.last_name,
      email,
    );
    const privacyConsentAt = r.date_joined || new Date();

    let userId = ex?.id || (await mapGet("User", r.id));
    if (!userId && r.uuid) userId = await mapGet("UserUuid", r.uuid);

    if (userId) {
      await jcos.query(
        `UPDATE "User" SET
           email = $2,
           "passwordHash" = NULL,
           role = 'USER',
           "isActive" = $3,
           "displayName" = $4,
           phone = COALESCE($5, phone),
           "marketingConsent" = $6,
           "marketingConsentAt" = CASE WHEN $6 THEN COALESCE("marketingConsentAt", NOW()) ELSE "marketingConsentAt" END,
           "privacyConsentAt" = COALESCE("privacyConsentAt", $7),
           "updatedAt" = NOW()
         WHERE id = $1`,
        [
          userId,
          email,
          Boolean(r.is_active),
          displayName,
          phone,
          marketingConsent,
          privacyConsentAt,
        ],
      );
    } else {
      userId = newId();
      await jcos.query(
        `INSERT INTO "User" (
           id, email, "passwordHash", role, "isActive", "displayName", phone,
           "privacyConsentAt", "privacyConsentVersion",
           "marketingConsent", "marketingConsentAt",
           "createdAt", "updatedAt", "tokenVersion", "adminSections"
         ) VALUES (
           $1, $2, NULL, 'USER', $3, $4, $5,
           $6, 'etl-saleor',
           $7, CASE WHEN $7 THEN NOW() ELSE NULL END,
           $8, NOW(), 0, ARRAY[]::text[]
         )`,
        [
          userId,
          email,
          Boolean(r.is_active),
          displayName,
          phone,
          privacyConsentAt,
          marketingConsent,
          r.date_joined || new Date(),
        ],
      );
    }

    await mapSet("User", r.id, userId);
    if (r.uuid) await mapSet("UserUuid", r.uuid, userId);
    upserted++;
    if (upserted % 500 === 0) {
      console.log(`  [users] …${upserted}/${rows.length}`);
    }
  }

  console.log(
    `[users] upserted=${upserted} skippedStaffEmail=${skippedStaffEmail} skippedBadEmail=${skippedBadEmail}`,
  );
}

function parseQuizFaceLatest(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  let raw = metadata.quiz_face_latest ?? metadata.quizFaceLatest ?? null;
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      raw = JSON.parse(t);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const zone = String(raw.zone || "face").trim() || "face";
  if (zone !== "face") return null;

  const answers =
    raw.answers && typeof raw.answers === "object" && !Array.isArray(raw.answers)
      ? raw.answers
      : null;
  if (!answers) return null;

  const resultRaw =
    raw.result && typeof raw.result === "object" && !Array.isArray(raw.result)
      ? raw.result
      : {};
  const blockKeys = Array.isArray(resultRaw.blockKeys)
    ? resultRaw.blockKeys.filter((k) => typeof k === "string" && k.trim())
    : [];
  const priority =
    typeof resultRaw.priority === "number" ? resultRaw.priority : null;

  let completedAt = null;
  if (typeof raw.completedAt === "string" && raw.completedAt.trim()) {
    const d = new Date(raw.completedAt);
    if (!Number.isNaN(d.getTime())) completedAt = d;
  }
  if (!completedAt) completedAt = new Date();

  const version =
    typeof raw.version === "number" && raw.version >= 1 ? Math.floor(raw.version) : 1;

  return {
    version,
    zone,
    answers,
    result: { priority, blockKeys },
    completedAt,
  };
}

async function planQuiz() {
  const { rows } = await saleor.query(`
    SELECT
      COUNT(*) FILTER (
        WHERE NOT is_staff
          AND metadata ? 'quiz_face_latest'
          AND COALESCE(metadata->>'quiz_face_latest', '') <> ''
          AND COALESCE(metadata->>'quiz_face_latest', '') <> 'null'
      )::int AS with_quiz
    FROM account_user
  `);
  console.log(
    `\n[quiz] saleor buyers with metadata.quiz_face_latest=${rows[0].with_quiz}`,
  );
  console.log(
    "[quiz] target: UserQuizResult (needs --step=users map email/id)",
  );
}

async function applyQuiz() {
  await ensureEtlMap();
  await planQuiz();

  const { rows } = await saleor.query(`
    SELECT
      u.id::text AS id,
      u.uuid::text AS uuid,
      lower(btrim(u.email)) AS email,
      u.metadata
    FROM account_user u
    WHERE NOT u.is_staff
      AND btrim(u.email) <> ''
      AND u.metadata ? 'quiz_face_latest'
      AND COALESCE(u.metadata->>'quiz_face_latest', '') <> ''
      AND COALESCE(u.metadata->>'quiz_face_latest', '') <> 'null'
    ORDER BY u.id ASC
  `);

  let upserted = 0;
  let skippedNoUser = 0;
  let skippedBadPayload = 0;

  for (const r of rows) {
    const payload = parseQuizFaceLatest(r.metadata);
    if (!payload) {
      skippedBadPayload++;
      continue;
    }

    let userId = await mapGet("User", r.id);
    if (!userId && r.uuid) userId = await mapGet("UserUuid", r.uuid);
    if (!userId) {
      const email = String(r.email || "").trim().toLowerCase();
      if (email) {
        const found = await jcos.query(
          `SELECT id FROM "User" WHERE lower(email) = $1 AND role = 'USER' LIMIT 1`,
          [email],
        );
        userId = found.rows[0]?.id || null;
      }
    }
    if (!userId) {
      skippedNoUser++;
      continue;
    }

    const existing = await jcos.query(
      `SELECT id FROM "UserQuizResult" WHERE "userId" = $1 LIMIT 1`,
      [userId],
    );
    if (existing.rows[0]?.id) {
      await jcos.query(
        `UPDATE "UserQuizResult" SET
           version = $2,
           zone = $3,
           answers = $4::jsonb,
           result = $5::jsonb,
           "completedAt" = $6,
           "updatedAt" = NOW()
         WHERE "userId" = $1`,
        [
          userId,
          payload.version,
          payload.zone,
          JSON.stringify(payload.answers),
          JSON.stringify(payload.result),
          payload.completedAt,
        ],
      );
    } else {
      await jcos.query(
        `INSERT INTO "UserQuizResult" (
           id, "userId", version, zone, answers, result, "completedAt", "createdAt", "updatedAt"
         ) VALUES (
           $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, NOW(), NOW()
         )`,
        [
          newId(),
          userId,
          payload.version,
          payload.zone,
          JSON.stringify(payload.answers),
          JSON.stringify(payload.result),
          payload.completedAt,
        ],
      );
    }
    upserted++;
  }

  console.log(
    `[quiz] upserted=${upserted} skippedNoUser=${skippedNoUser} skippedBadPayload=${skippedBadPayload}`,
  );
}

async function planAddresses() {
  const { rows } = await saleor.query(`
    SELECT
      COUNT(*)::int AS links,
      COUNT(DISTINCT ua.user_id)::int AS users
    FROM account_user_addresses ua
    JOIN account_user u ON u.id = ua.user_id
    WHERE NOT u.is_staff
  `);
  console.log(
    `\n[addresses] saleor buyer links=${rows[0].links} users=${rows[0].users}`,
  );
}

async function applyAddresses() {
  await ensureEtlMap();
  await planAddresses();

  const { rows } = await saleor.query(`
    SELECT
      a.id::text AS address_id,
      u.id::text AS user_id,
      a.first_name,
      a.last_name,
      a.street_address_1,
      a.street_address_2,
      a.city,
      a.postal_code,
      a.phone,
      a.city_area,
      a.country_area,
      u.default_shipping_address_id,
      u.default_billing_address_id
    FROM account_user_addresses ua
    JOIN account_user u ON u.id = ua.user_id
    JOIN account_address a ON a.id = ua.address_id
    WHERE NOT u.is_staff
    ORDER BY u.id ASC, a.id ASC
  `);

  let upserted = 0;
  let skippedNoUser = 0;
  let skippedEmpty = 0;

  // Снести старые ETL-адреса покупателей и перезалить (идемпотентно по карте)
  // Не трогаем адреса пользователей без map (ручные).
  const mappedUsers = await jcos.query(
    `SELECT DISTINCT "jcosId" FROM "_EtlIdMap" WHERE entity = 'User'`,
  );
  const mappedUserIds = mappedUsers.rows.map((r) => r.jcosId);
  if (mappedUserIds.length > 0) {
    await jcos.query(
      `DELETE FROM "UserAddress" WHERE "userId" = ANY($1::text[])`,
      [mappedUserIds],
    );
  }

  for (const r of rows) {
    const userId = await mapGet("User", r.user_id);
    if (!userId) {
      skippedNoUser++;
      continue;
    }
    const city = String(r.city || "").trim();
    const address = String(r.street_address_1 || "").trim();
    if (!city || !address) {
      skippedEmpty++;
      continue;
    }
    const recipientName = [r.first_name, r.last_name]
      .map((x) => (x || "").trim())
      .filter(Boolean)
      .join(" ")
      .trim() || null;
    const apartment = String(r.street_address_2 || "").trim() || null;
    const postalCode = String(r.postal_code || "").trim() || null;
    const phone = String(r.phone || "").trim() || null;
    const commentParts = [r.city_area, r.country_area]
      .map((x) => (x || "").trim())
      .filter(Boolean);
    const comment = commentParts.length ? commentParts.join(", ") : null;
    const isDefault =
      String(r.default_shipping_address_id) === String(r.address_id) ||
      String(r.default_billing_address_id) === String(r.address_id);

    const addrId = newId();
    await jcos.query(
      `INSERT INTO "UserAddress" (
         id, "userId", "recipientName", phone, city, address, apartment,
         "postalCode", comment, "isDefault", "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
       )`,
      [
        addrId,
        userId,
        recipientName,
        phone,
        city,
        address,
        apartment,
        postalCode,
        comment,
        isDefault,
      ],
    );
    await mapSet("UserAddress", r.address_id, addrId);
    upserted++;
  }

  // Один default на пользователя: если несколько — оставить shipping default / первый
  if (mappedUserIds.length > 0) {
    await jcos.query(
      `
    WITH ranked AS (
      SELECT id, "userId",
        ROW_NUMBER() OVER (
          PARTITION BY "userId"
          ORDER BY "isDefault" DESC, "createdAt" ASC
        ) AS rn
      FROM "UserAddress"
      WHERE "userId" = ANY($1::text[])
    )
    UPDATE "UserAddress" ua
    SET "isDefault" = (ranked.rn = 1)
    FROM ranked
    WHERE ua.id = ranked.id
  `,
      [mappedUserIds],
    );
  }

  console.log(
    `[addresses] upserted=${upserted} skippedNoUser=${skippedNoUser} skippedEmpty=${skippedEmpty}`,
  );
}

async function planReviews() {
  const { rows } = await saleor.query(`
    SELECT
      COUNT(*)::int AS n,
      COUNT(*) FILTER (WHERE is_published)::int AS published,
      COUNT(*) FILTER (WHERE btrim(COALESCE(image_1, '')) <> '')::int AS with_img
    FROM product_productreview
  `);
  console.log(
    `\n[reviews] saleor total=${rows[0].n} published=${rows[0].published} withImages=${rows[0].with_img}`,
  );
}

async function applyReviews() {
  await ensureEtlMap();
  await planReviews();

  const { rows } = await saleor.query(`
    SELECT
      r.id::text AS id,
      r.product_id,
      r.user_id,
      r.order_id::text AS order_id,
      r.rating,
      r.text,
      r.is_published,
      r.moderated_at,
      NULLIF(btrim(COALESCE(r.image_1, '')), '') AS image_1,
      NULLIF(btrim(COALESCE(r.image_2, '')), '') AS image_2,
      r.created_at,
      r.updated_at
    FROM product_productreview r
    ORDER BY r.created_at ASC
  `);

  let upserted = 0;
  let missingProducts = 0;
  let images = 0;

  for (const r of rows) {
    const productId = await mapGet("Product", r.product_id);
    if (!productId) {
      missingProducts++;
      console.warn(`  [reviews] skip ${r.id}: no Product map for saleor ${r.product_id}`);
      continue;
    }

    const image1Url = r.image_1
      ? await resolveReviewImage(r.image_1, r.id, 1)
      : null;
    const image2Url = r.image_2
      ? await resolveReviewImage(r.image_2, r.id, 2)
      : null;
    if (image1Url) images++;
    if (image2Url) images++;

    const existing = await jcos.query(
      `SELECT id FROM "ProductReview" WHERE "saleorId" = $1`,
      [r.id],
    );
    let reviewId = existing.rows[0]?.id;
    if (!reviewId) {
      reviewId = newId();
      await jcos.query(
        `INSERT INTO "ProductReview" (
          id, "productId", "userId", "orderId", rating, text, "authorName",
          "image1Url", "image2Url", "isPublished", "moderatedById", "moderatedAt",
          "saleorId", "createdAt", "updatedAt"
        ) VALUES (
          $1,$2,NULL,$3,$4,$5,NULL,$6,$7,$8,NULL,$9,$10,$11,$12
        )`,
        [
          reviewId,
          productId,
          r.order_id || null,
          r.rating,
          r.text,
          image1Url,
          image2Url,
          r.is_published,
          r.moderated_at,
          r.id,
          r.created_at,
          r.updated_at,
        ],
      );
    } else {
      await jcos.query(
        `UPDATE "ProductReview" SET
          "productId" = $2,
          "orderId" = $3,
          rating = $4,
          text = $5,
          "image1Url" = $6,
          "image2Url" = $7,
          "isPublished" = $8,
          "moderatedAt" = $9,
          "createdAt" = $10,
          "updatedAt" = $11
         WHERE id = $1`,
        [
          reviewId,
          productId,
          r.order_id || null,
          r.rating,
          r.text,
          image1Url,
          image2Url,
          r.is_published,
          r.moderated_at,
          r.created_at,
          r.updated_at,
        ],
      );
    }
    await mapSet("ProductReview", r.id, reviewId);
    upserted++;
  }

  console.log(
    `[reviews] upserted=${upserted} missingProducts=${missingProducts} images=${images}`,
  );
}

const catalogSteps = new Set(["tags", "categories", "products"]);
function want(name) {
  if (step === "catalog") return catalogSteps.has(name);
  if (step === "all") {
    if (apply) {
      return (
        catalogSteps.has(name) ||
        name === "media" ||
        name === "collections" ||
        name === "reviews" ||
        name === "category-covers" ||
        name === "blog" ||
        name === "hero" ||
        name === "delivery" ||
        name === "cart" ||
        name === "legal" ||
        name === "about" ||
        name === "faq" ||
        name === "users" ||
        name === "addresses" ||
        name === "quiz" ||
        name === "variant-dimensions" ||
        name === "gratitude"
      );
    }
    return true;
  }
  return step === name;
}

console.log(`mode=${apply ? "APPLY" : "DRY-RUN"} step=${step}`);
console.log("saleor:", saleorUrl.replace(/:[^:@/]+@/, ":***@"));
if (apply) console.log("jcos:", jcosUrl.replace(/:[^:@/]+@/, ":***@"));
console.log(`forceActive=${FORCE_ACTIVE} forceStock=${FORCE_STOCK || 0}`);

try {
  if (want("tags")) {
    if (apply) await applyTags();
    else await planTags();
  }
  if (want("categories")) {
    if (apply) await applyCategories();
    else await planCategories();
  }
  if (want("products")) {
    if (apply) await applyProducts();
    else await planProducts();
  }
  if (want("media")) {
    if (apply) await applyMedia();
    else await planMedia();
  }
  if (want("collections")) {
    if (apply) await applyCollections();
    else await planCollections();
  }
  if (want("reviews")) {
    if (apply) await applyReviews();
    else await planReviews();
  }
  if (want("category-covers")) {
    if (apply) await applyCategoryCovers();
    else await planCategoryCovers();
  }
  if (want("blog")) {
    if (apply) await applyBlog();
    else await planBlog();
  }
  if (want("hero")) {
    if (apply) await applyHero();
    else await planHero();
  }
  if (want("delivery") || want("cart")) {
    if (apply) await applyDelivery();
    else await planDelivery();
  }
  if (want("legal")) {
    if (apply) await applyLegal();
    else await planLegal();
  }
  if (want("about")) {
    if (apply) await applyAbout();
    else await planAbout();
  }
  if (want("faq")) {
    if (apply) await applyFaq();
    else await planFaq();
  }
  if (want("users")) {
    if (apply) await applyUsers();
    else await planUsers();
  }
  if (want("addresses")) {
    if (apply) await applyAddresses();
    else await planAddresses();
  }
  if (want("quiz")) {
    if (apply) await applyQuiz();
    else await planQuiz();
  }
  if (want("variant-dimensions")) {
    if (apply) await applyVariantDimensions();
    else await planVariantDimensions();
  }
  if (want("gratitude")) {
    if (apply) await applyGratitude();
    else await planGratitude();
  }
} finally {
  await saleor.end();
  if (apply) await jcos.end();
}
console.log("\nDone.");
