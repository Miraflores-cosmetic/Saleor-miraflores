#!/usr/bin/env node
/**
 * Restore missing ProductImage from VPS wipe backup saleor_media.tgz.
 *
 *   node restore-media-from-backup.mjs
 *   node restore-media-from-backup.mjs --apply
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { basename, dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import pg from 'pg';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apply = process.argv.includes('--apply');

const saleorUrl = process.env.SALEOR_DATABASE_URL || 'postgresql:///saleor_etl';
const jcosUrl =
  process.env.MIRAFLORES_DATABASE_URL ||
  'postgresql://miraflores:miraflores@localhost:5432/miraflores';
const uploadsDir =
  process.env.MIRAFLORES_UPLOADS_DIR ||
  join(__dirname, '../../backend/.data/local-uploads');
const publicUrl = (
  process.env.MIRAFLORES_UPLOADS_PUBLIC_URL || 'http://127.0.0.1:3001'
).replace(/\/$/, '');

const DEPLOY_HOST = process.env.DEPLOY_HOST || 'root@91.229.8.83';
const DEPLOY_SSH_KEY =
  (process.env.DEPLOY_SSH_KEY || '~/.ssh/id_ed25519_mira_ap').replace(
    /^~/,
    process.env.HOME,
  );
const REMOTE_TGZ =
  process.env.SALEOR_MEDIA_TGZ ||
  '/root/miraflores-wipe-backup_2026-09-01_1536/saleor_media.tgz';
const REMOTE_UPLOADS =
  process.env.REMOTE_UPLOADS_DIR ||
  '/opt/miraflores/backend/.data/local-uploads';
const PROD_PUBLIC =
  process.env.PROD_UPLOADS_PUBLIC_URL || 'https://miraflores-shop.com';

function newId() {
  return randomBytes(12).toString('base64url').slice(0, 21);
}

function safeExt(path) {
  const e = extname(String(path).split('?')[0]).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(e)) return e;
  return '.png';
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
}

function sshBash(script) {
  return run(
    'ssh',
    ['-i', DEPLOY_SSH_KEY, '-o', 'BatchMode=yes', DEPLOY_HOST, 'bash', '-s'],
    { input: script, stdio: ['pipe', 'pipe', 'inherit'] },
  );
}

function scpTo(localPath, remotePath) {
  run(
    'scp',
    [
      '-i',
      DEPLOY_SSH_KEY,
      '-o',
      'BatchMode=yes',
      localPath,
      `${DEPLOY_HOST}:${remotePath}`,
    ],
    { stdio: 'inherit' },
  );
}

function scpFrom(remotePath, localPath) {
  mkdirSync(dirname(localPath), { recursive: true });
  run(
    'scp',
    [
      '-i',
      DEPLOY_SSH_KEY,
      '-o',
      'BatchMode=yes',
      `${DEPLOY_HOST}:${remotePath}`,
      localPath,
    ],
    { stdio: 'inherit' },
  );
}

function assertImageFile(path) {
  const buf = readFileSync(path);
  if (buf.length < 24) throw new Error(`too small: ${path}`);
  const head = buf.subarray(0, 32).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html')) {
    throw new Error(`HTML fake: ${path}`);
  }
  const ok =
    (buf[0] === 0xff && buf[1] === 0xd8) ||
    (buf[0] === 0x89 && buf[1] === 0x50) ||
    (buf[0] === 0x47 && buf[1] === 0x49) ||
    (buf[0] === 0x52 && buf[1] === 0x49);
  if (!ok) throw new Error(`bad magic: ${path}`);
  return buf.length;
}

async function buildPlan(saleor, jcos) {
  const { rows: dump } = await saleor.query(`
    SELECT p.id AS saleor_pid, pm.image, COALESCE(pm.sort_order, 0) AS sort_order, pm.id
    FROM product_product p
    JOIN product_productmedia pm ON pm.product_id = p.id
    WHERE pm.image IS NOT NULL AND btrim(pm.image) <> ''
    ORDER BY p.id, sort_order, pm.id
  `);
  const { rows: map } = await jcos.query(
    `SELECT "saleorId", "jcosId" FROM "_EtlIdMap" WHERE entity = 'Product'`,
  );
  const pidBySaleor = new Map(map.map((r) => [r.saleorId, r.jcosId]));
  const { rows: products } = await jcos.query(`SELECT id, slug FROM "Product"`);
  const slugByPid = new Map(products.map((p) => [p.id, p.slug]));
  const { rows: imgs } = await jcos.query(
    `SELECT "productId", "sortOrder" FROM "ProductImage"`,
  );
  const have = new Map();
  for (const r of imgs) {
    if (!have.has(r.productId)) have.set(r.productId, new Set());
    have.get(r.productId).add(r.sortOrder);
  }

  const byProd = new Map();
  for (const r of dump) {
    const k = String(r.saleor_pid);
    if (!byProd.has(k)) byProd.set(k, []);
    byProd.get(k).push(r);
  }

  const missing = [];
  for (const [saleorPid, rows] of byProd) {
    const jid = pidBySaleor.get(saleorPid);
    if (!jid) continue;
    const slug = slugByPid.get(jid);
    if (!slug) continue;
    const set = have.get(jid) ?? new Set();
    rows.forEach((r, index) => {
      if (set.has(index)) return;
      const saleorPath = String(r.image).replace(/^\/+/, '');
      const ext = safeExt(saleorPath);
      const fileName = `${slug}-${index}${ext}`;
      missing.push({
        productId: jid,
        slug,
        sortOrder: index,
        saleorPath,
        fileName,
        id: newId(),
      });
    });
  }
  return missing;
}

async function main() {
  const saleor = new pg.Client({ connectionString: saleorUrl });
  const jcos = new pg.Client({ connectionString: jcosUrl });
  await saleor.connect();
  await jcos.connect();

  const plan = await buildPlan(saleor, jcos);
  writeFileSync('/tmp/mira_media_restore_plan.json', JSON.stringify(plan, null, 2));
  console.log(`missing=${plan.length} apply=${apply}`);
  if (!plan.length) {
    await saleor.end();
    await jcos.end();
    return;
  }
  if (!apply) {
    console.log('dry-run sample:', plan.slice(0, 3));
    await saleor.end();
    await jcos.end();
    return;
  }

  const members = [...new Set(plan.map((p) => `./${p.saleorPath}`))];
  writeFileSync('/tmp/mira_media_members.txt', members.join('\n') + '\n');
  scpTo('/tmp/mira_media_members.txt', '/tmp/mira_media_members.txt');
  scpTo('/tmp/mira_media_restore_plan.json', '/tmp/mira_media_restore_plan.json');

  console.log(`extract ${members.length} unique paths from backup…`);
  const extractOut = sshBash(`
set -euo pipefail
rm -rf /tmp/mira_media_extract
mkdir -p /tmp/mira_media_extract "${REMOTE_UPLOADS}/products/etl"
tar -xzf "${REMOTE_TGZ}" -C /tmp/mira_media_extract --files-from=/tmp/mira_media_members.txt
python3 - <<'PY'
import json, shutil
from pathlib import Path
plan=json.loads(Path("/tmp/mira_media_restore_plan.json").read_text())
src_root=Path("/tmp/mira_media_extract")
dst_root=Path("${REMOTE_UPLOADS}/products/etl")
ok=fail=0
failed=[]
for item in plan:
  src=src_root/item["saleorPath"]
  dst=dst_root/item["fileName"]
  if not src.is_file():
    fail+=1; failed.append(item["fileName"]+" missing "+item["saleorPath"]); continue
  data=src.read_bytes()[:32].lstrip().lower()
  if data.startswith(b"<!doctype") or data.startswith(b"<html"):
    fail+=1; failed.append(item["fileName"]+" html"); continue
  if len(src.read_bytes()) < 24:
    fail+=1; failed.append(item["fileName"]+" tiny"); continue
  shutil.copy2(src, dst)
  ok+=1
print(f"copied={ok} failed={fail}")
for f in failed[:20]:
  print(" FAIL", f)
PY
`);
  console.log(extractOut.trim());

  // Pull restored files locally
  const destRoot = join(uploadsDir, 'products', 'etl');
  mkdirSync(destRoot, { recursive: true });
  let restored = 0;
  let failed = 0;
  const okRows = [];

  for (const item of plan) {
    const localAbs = join(destRoot, item.fileName);
    const remoteAbs = `${REMOTE_UPLOADS}/products/etl/${item.fileName}`;
    try {
      scpFrom(remoteAbs, localAbs);
      const size = assertImageFile(localAbs);
      const localUrl = `${publicUrl}/uploads/products/etl/${item.fileName}`;
      const prodUrl = `${PROD_PUBLIC}/uploads/products/etl/${item.fileName}`;

      await jcos.query(
        `DELETE FROM "ProductImage" WHERE "productId" = $1 AND "sortOrder" = $2`,
        [item.productId, item.sortOrder],
      );
      await jcos.query(
        `INSERT INTO "ProductImage" (id, "productId", url, "mediaType", "sortOrder", "createdAt")
         VALUES ($1, $2, $3, 'image', $4, NOW())`,
        [item.id, item.productId, localUrl, item.sortOrder],
      );
      okRows.push({ ...item, prodUrl, size });
      restored++;
      console.log(`  ✓ ${item.fileName} (${size}b)`);
    } catch (e) {
      failed++;
      console.warn(`  ✗ ${item.fileName}: ${e.message || e}`);
    }
  }

  if (okRows.length) {
    const sql = [
      'BEGIN;',
      ...okRows.flatMap((r) => [
        `DELETE FROM "ProductImage" WHERE "productId" = '${r.productId}' AND "sortOrder" = ${r.sortOrder};`,
        `INSERT INTO "ProductImage" (id, "productId", url, "mediaType", "sortOrder", "createdAt") VALUES ('${r.id}', '${r.productId}', '${r.prodUrl.replace(/'/g, "''")}', 'image', ${r.sortOrder}, NOW());`,
      ]),
      'COMMIT;',
    ].join('\n');
    writeFileSync('/tmp/mira_media_restore_inserts.sql', sql + '\n');
    scpTo('/tmp/mira_media_restore_inserts.sql', '/tmp/mira_media_restore_inserts.sql');
    sshBash(`
docker cp /tmp/mira_media_restore_inserts.sql miraflores_db:/tmp/mira_media_restore_inserts.sql
docker exec -i miraflores_db psql -U miraflores -d miraflores -v ON_ERROR_STOP=1 -f /tmp/mira_media_restore_inserts.sql
`);
  }

  console.log(`restored=${restored} failed=${failed}`);
  // smoke
  console.log(
    sshBash(
      `curl -sS -o /dev/null -w "%{http_code} %{size_download}\\n" https://miraflores-shop.com/uploads/products/etl/tverdyi-shampun-avokado-i-mylnyi-orekh-2.png || true`,
    ).trim(),
  );

  await saleor.end();
  await jcos.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
