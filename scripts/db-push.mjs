#!/usr/bin/env node
/**
 * 应用 db/migrations/*.sql 到目标 Supabase Postgres。
 *
 * 为什么不直接用 `supabase db push`：
 *   那条路需要 `supabase login`（Personal Access Token）+ `supabase link`，
 *   且 CLI 只认 `supabase/migrations/` 目录。本项目把迁移放在 `db/migrations/`，
 *   自己驱动反而更短、也更好复现。
 *
 * 连接串从 .env.local 的 SUPABASE_DB_URL 读（已 gitignore，绝不提交）。
 * 每个文件一个事务：失败即回滚，不会留下半套 schema。
 * 已应用过的文件按 checksum 跳过；文件内容变了（checksum 变化）则重新应用。
 *
 * 用法: pnpm db:push
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'db', 'migrations');
const envFile = path.join(root, '.env.local');

/** 极简 .env.local 读取器：只认 KEY=VALUE，够用且不引依赖。 */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(envFile);

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error(
    '缺少 SUPABASE_DB_URL。请在 .env.local 里写上 Supabase pooler 连接串：\n' +
      '  SUPABASE_DB_URL=postgresql://postgres.<项目ref>:<密码>@aws-<n>-<region>.pooler.supabase.com:5432/postgres',
  );
  process.exit(1);
}

if (!fs.existsSync(migrationsDir)) {
  console.error(`找不到迁移目录: ${migrationsDir}`);
  process.exit(1);
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (!files.length) {
  console.error('db/migrations 下没有 .sql 文件');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

await client.connect();
console.log(`已连接：${redact(connectionString)}`);

// 迁移台账（基础设施表，不属于业务表，不进 TroveDb）
// Supabase 对 public schema 有默认权限，新表一建出来 anon 就有全量表权限，
// 这里显式收掉（RLS 也开着，双保险）。
await client.query(`
  create table if not exists public.trove_schema_migrations (
    name       text primary key,
    checksum   text not null,
    applied_at timestamptz not null default now()
  )
`);
await client.query('revoke all on table public.trove_schema_migrations from anon');

let applied = 0;
let skipped = 0;

for (const file of files) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  const checksum = crypto.createHash('sha256').update(sql, 'utf8').digest('hex');

  const { rows } = await client.query(
    'select checksum from public.trove_schema_migrations where name = $1',
    [file],
  );

  if (rows.length && rows[0].checksum === checksum) {
    console.log(`  skip   ${file}`);
    skipped += 1;
    continue;
  }

  const label = rows.length ? `${file}（内容已变更，重新应用）` : file;
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query(
      `insert into public.trove_schema_migrations (name, checksum)
       values ($1, $2)
       on conflict (name) do update set checksum = $2, applied_at = now()`,
      [file, checksum],
    );
    await client.query('commit');
    console.log(`  apply  ${label}`);
    applied += 1;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.error(`  FAIL   ${file}`);
    console.error(`         ${err.message}`);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

await client.end();
console.log(`完成：新应用 ${applied} 个，跳过 ${skipped} 个。`);

/** 日志里不出现明文密码。 */
function redact(uri) {
  return uri.replace(/\/\/([^:]+):[^@]*@/, '//$1:***@');
}
