import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeTroveDb } from '../helpers/fake-db';

const fakeDb = new FakeTroveDb();

vi.mock('@/lib/db/trove-db', () => ({
  TroveDb: {
    forUser: () => fakeDb,
    forSession: () => fakeDb,
  },
}));

type ToolFn = (args: never, ctx: unknown) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

const tools = new Map<string, ToolFn>();

const fakeServer = {
  registerTool: (
    name: string,
    _config: unknown,
    cb: (args: never, ctx: unknown) => Promise<unknown>,
  ) => {
    tools.set(name, cb as ToolFn);
  },
};

const ctxWith = (scopes: string[]) => ({
  http: {
    authInfo: {
      token: 'trv_secret',
      clientId: 'catchlinger-api-key',
      scopes,
      extra: { userId: fakeDb.userId },
    },
  },
});

function parse(result: { content: Array<{ text: string }>; isError?: boolean }) {
  return {
    ...result,
    payload: JSON.parse(result.content[0].text),
  };
}

describe('MCP 工具', () => {
  beforeEach(async () => {
    tools.clear();
    const { registerCatchlingerTools } = await import('@/lib/mcp/server');
    registerCatchlingerTools(fakeServer as never);
  });

  it('注册了计划约定的全部工具', () => {
    const expected = [
      'catchlinger_search',
      'catchlinger_get',
      'catchlinger_save',
      'catchlinger_save_many',
      'catchlinger_update',
      'catchlinger_archive',
      'catchlinger_delete',
      'catchlinger_add_note',
      'catchlinger_mark_read',
      'catchlinger_stats',
      'catchlinger_list_reminders',
      'catchlinger_account',
      'catchlinger_list_tags',
      'catchlinger_manage_tag',
    ];
    expect([...tools.keys()].sort()).toEqual([...expected].sort());
    for (const name of expected) {
      expect(tools.has(name)).toBe(true);
    }
  });

  it('catchlinger_save 写入一条收藏并返回 created', async () => {
    const save = tools.get('catchlinger_save')!;
    const result = parse(
      await save(
        {
          url: 'https://example.com/a',
          title: '标题',
          summary: '摘要',
          tags: ['数据库'],
        } as never,
        ctxWith(['items:read', 'items:write']),
      ),
    );

    expect(result.isError).toBeUndefined();
    expect(result.payload.created).toBe(true);
    expect(result.payload.tags).toEqual(['数据库']);
  });

  it('catchlinger_save 重复提交同一 URL → created=false', async () => {
    const save = tools.get('catchlinger_save')!;
    const ctx = ctxWith(['items:read', 'items:write']);

    await save(
      { url: 'https://example.com/dup', title: 'T' } as never,
      ctx,
    );
    const second = parse(
      await save({ url: 'https://example.com/dup', title: 'T2' } as never, ctx),
    );

    expect(second.payload.created).toBe(false);
  });

  it('写工具缺少 items:write 权限 → isError', async () => {
    const save = tools.get('catchlinger_save')!;
    const result = parse(
      await save(
        { url: 'https://example.com/x', title: 'T' } as never,
        ctxWith(['items:read']),
      ),
    );
    expect(result.isError).toBe(true);
    expect(result.payload.error.code).toBe('FORBIDDEN');
  });

  it('catchlinger_save 标签超过 3 个 → isError 且 code=MAX_TAGS_EXCEEDED', async () => {
    const save = tools.get('catchlinger_save')!;
    const result = parse(
      await save(
        {
          url: 'https://example.com/y',
          title: 'T',
          tags: ['a', 'b', 'c', 'd'],
        } as never,
        ctxWith(['items:read', 'items:write']),
      ),
    );
    expect(result.isError).toBe(true);
    expect(result.payload.error.code).toBe('MAX_TAGS_EXCEEDED');
  });

  it('catchlinger_search 能按标签过滤', async () => {
    const save = tools.get('catchlinger_save')!;
    const search = tools.get('catchlinger_search')!;
    const ctx = ctxWith(['items:read', 'items:write']);

    await save(
      { url: 'https://example.com/t1', title: '带标签', tags: ['检索标签'] } as never,
      ctx,
    );
    await save(
      { url: 'https://example.com/t2', title: '无标签' } as never,
      ctx,
    );

    const result = parse(
      await search({ tags: ['检索标签'] } as never, ctx),
    );
    expect(result.payload).toHaveLength(1);
    expect(result.payload[0].title).toBe('带标签');
  });

  it('catchlinger_manage_tag 支持 create / rename / delete', async () => {
    const manage = tools.get('catchlinger_manage_tag')!;
    const ctx = ctxWith(['items:read', 'items:write']);

    const created = parse(
      await manage({ action: 'create', name: '手动标签' } as never, ctx),
    );
    expect(created.payload.created).toBe(true);
    const tagId = created.payload.tag.id;

    const renamed = parse(
      await manage({ action: 'rename', tag_id: tagId, new_name: '改名后' } as never, ctx),
    );
    expect(renamed.payload.tag.name).toBe('改名后');

    const deleted = parse(
      await manage({ action: 'delete', tag_id: tagId } as never, ctx),
    );
    expect(deleted.payload.deleted).toBe(true);
  });

  it('缺少身份信息 → 返回结构化错误而不是抛异常', async () => {
    const save = tools.get('catchlinger_save')!;
    const result = parse(
      await save({ url: 'https://example.com/z', title: 'T' } as never, {
        http: { authInfo: { scopes: ['items:write'], extra: {} } },
      }),
    );
    expect(result.isError).toBe(true);
  });
});
