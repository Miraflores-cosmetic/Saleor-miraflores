#!/usr/bin/env node
/**
 * Phase 2 — dry-run inventory of Saleor ETL source.
 * Usage: node scripts/etl/inventory.mjs
 * Env: SALEOR_DATABASE_URL (or scripts/etl/.env)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
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

const url =
  process.env.SALEOR_DATABASE_URL ||
  "postgresql://saleor:saleor@localhost:5432/saleor_etl";

const client = new pg.Client({ connectionString: url });
await client.connect();

async function count(sql) {
  const { rows } = await client.query(sql);
  return Number(rows[0].n);
}

const tables = [
  ["product", `SELECT COUNT(*)::int AS n FROM product_product`],
  ["variant", `SELECT COUNT(*)::int AS n FROM product_productvariant`],
  ["category", `SELECT COUNT(*)::int AS n FROM product_category`],
  ["collection", `SELECT COUNT(*)::int AS n FROM product_collection`],
  ["media", `SELECT COUNT(*)::int AS n FROM product_productmedia`],
  ["review", `SELECT COUNT(*)::int AS n FROM product_productreview`],
  ["user", `SELECT COUNT(*)::int AS n FROM account_user`],
  ["address", `SELECT COUNT(*)::int AS n FROM account_address`],
  ["order", `SELECT COUNT(*)::int AS n FROM order_order`],
  ["orderline", `SELECT COUNT(*)::int AS n FROM order_orderline`],
  ["page", `SELECT COUNT(*)::int AS n FROM page_page`],
];

console.log("=== Saleor ETL inventory ===");
console.log("source:", url.replace(/:[^:@/]+@/, ":***@"));
for (const [name, sql] of tables) {
  console.log(`${name.padEnd(12)} ${await count(sql)}`);
}

const { rows: careValues } = await client.query(`
  SELECT av.slug, av.name, COUNT(DISTINCT apav.product_id)::int AS products
  FROM attribute_attribute a
  JOIN attribute_attributevalue av ON av.attribute_id = a.id
  LEFT JOIN attribute_assignedproductattributevalue apav ON apav.value_id = av.id
  WHERE a.slug = 'care_stage'
  GROUP BY av.slug, av.name, av.sort_order
  ORDER BY av.sort_order NULLS LAST, av.slug
`);
console.log("\n=== care_stage → CatalogTag (planned) ===");
for (const r of careValues) {
  console.log(
    `  care-stage-${r.slug}  "${r.name}"  products=${r.products}`,
  );
}

const { rows: orphans } = await client.query(`
  SELECT COUNT(*)::int AS n
  FROM product_productvariant v
  LEFT JOIN product_product p ON p.id = v.product_id
  WHERE p.id IS NULL
`);
console.log("\n=== checks ===");
console.log("orphan variants:", orphans[0].n);

const { rows: noSku } = await client.query(`
  SELECT COUNT(*)::int AS n FROM product_productvariant WHERE sku IS NULL OR btrim(sku) = ''
`);
console.log("variants without sku:", noSku[0].n);

const { rows: favQuiz } = await client.query(`
  SELECT
    COUNT(*) FILTER (WHERE private_metadata::text ILIKE '%favorite%')::int AS fav,
    COUNT(*) FILTER (WHERE private_metadata::text ILIKE '%quiz%')::int AS quiz
  FROM account_user
`);
console.log("users private_metadata favorite-ish:", favQuiz[0].fav);
console.log("users private_metadata quiz-ish:", favQuiz[0].quiz);

const { rows: pages } = await client.query(`
  SELECT slug, title FROM page_page ORDER BY slug
`);
console.log("\n=== pages ===");
for (const p of pages) console.log(`  ${p.slug} — ${p.title}`);

await client.end();
console.log("\nDone (dry-run inventory only).");
