import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { TroveDb } from '@/lib/db/trove-db';

const SRC = path.resolve(process.cwd(), 'src');
const GATE = path.join(SRC, 'lib', 'db', 'trove-db.ts');

/** 受保护的业务表：这些表的访问必须收口在 TroveDb 里。 */
const PROTECTED_TABLES = [
  'items',
  'notes',
  'tags',
  'item_tags',
  'click_events',
  'api_keys',
  'profiles',
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('TroveDb 是唯一的数据访问入口', () => {
  it('src/ 下除 trove-db.ts 外没有裸的 .from(业务表) 调用', () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      if (path.resolve(file) === path.resolve(GATE)) continue;
      const content = readFileSync(file, 'utf8');
      for (const table of PROTECTED_TABLES) {
        const re = new RegExp(`\\.from\\(\\s*['"\`]${table}['"\`]\\s*\\)`);
        if (re.test(content)) {
          offenders.push(
            `${path.relative(process.cwd(), file)} → .from('${table}')`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('构造时缺少 userId 直接抛错（杜绝无过滤查询）', () => {
    expect(() => new TroveDb('', {} as never)).toThrow(
      /SCOPED_CLIENT_REQUIRES_USER_ID/,
    );
    expect(() => new TroveDb(undefined as never, {} as never)).toThrow(
      /SCOPED_CLIENT_REQUIRES_USER_ID/,
    );
  });

  it('forUser 缺少服务端环境变量时抛 INTERNAL', () => {
    const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      expect(() => TroveDb.forUser('user-1')).toThrow();
    } finally {
      if (savedUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
      if (savedKey) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
    }
  });
});
