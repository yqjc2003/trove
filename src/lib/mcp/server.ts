import { z } from 'zod';

import { TroveDb } from '@/lib/db/trove-db';
import { toAppError } from '@/lib/domain/errors';
import type { ServiceContext } from '@/lib/services/context';
import {
  deleteItem,
  getItem,
  listItems,
  saveItem,
  saveItems,
  updateItem,
  type SaveItemInput,
} from '@/lib/services/items';
import { addNote } from '@/lib/services/notes';
import { getAccountInfo } from '@/lib/services/account';
import { createTag, deleteTag, listTags, renameTag } from '@/lib/services/tags';
import { getStats, listReminders } from '@/lib/services/reminders';
import type { ItemSource, ContentType } from '@/types';

export interface McpAuthContext {
  userId?: string;
  scopes: string[];
}

/** 从 MCP 工具上下文里取出已验证的身份。 */
export function authFromContext(ctx: unknown): McpAuthContext {
  const http = (
    ctx as {
      http?: {
        authInfo?: { extra?: Record<string, unknown>; scopes?: string[] };
      };
    }
  )?.http;
  const authInfo = http?.authInfo;
  const userId = authInfo?.extra?.userId;
  return {
    userId: typeof userId === 'string' ? userId : undefined,
    scopes: authInfo?.scopes ?? [],
  };
}

export function serviceContext(auth: McpAuthContext): ServiceContext {
  if (!auth.userId) {
    throw new Error('UNAUTHORIZED');
  }
  return {
    db: TroveDb.forUser(auth.userId),
    userId: auth.userId,
    scopes: auth.scopes,
  };
}

export function toolError(code: string, message: string, details?: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          { error: { code, message, ...(details ? { details } : {}) } },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

export function toolOk(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

const contentTypeEnum = z.enum([
  'article',
  'video',
  'repo',
  'tool',
  'social',
  'doc',
  'other',
]);

const sourceEnum = z.enum(['manual', 'skill', 'mcp', 'github', 'bookmark']);

const saveItemSchema = z.object({
  url: z.string().min(1),
  title: z.string().min(1).max(300),
  summary: z.string().max(1000).optional(),
  tags: z
    .array(z.string())
    .max(3)
    .optional()
    .describe(
      '通常 1–2 个可聚合多篇内容的宽主题标签，最多 3 个；优先复用既有领域/技术栈/学习方式，具体类名和 API 留在标题摘要。',
    ),
  content_type: contentTypeEnum.optional(),
  source: sourceEnum.optional(),
  source_ref: z.string().max(300).optional(),
  content_excerpt: z.string().max(2000).optional(),
  notes: z.string().max(50000).optional(),
});

const searchSchema = z.object({
  q: z.string().optional(),
  domain: z.string().optional(),
  tags: z.array(z.string()).optional(),
  content_type: contentTypeEnum.optional(),
  source: sourceEnum.optional(),
  status: z.enum(['active', 'archived', 'all']).optional(),
  read: z.enum(['read', 'unread', 'all']).optional(),
  overdue: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const AI_GUIDANCE = [
  'AI 解读由调用方（Agent）负责，服务端不抓取正文、不调用任何模型。',
  '正确用法：先用 fetch-content 之类的工具拿到正文 → 自己产出 title（≤300）、summary（≤1000）、tags（≤3）→ 再调用本工具写入。',
  '标签是聚合多篇收藏的检索入口，粒度应略高于文章关键词。通常选 1–2 个，最多 3 个，不必凑满：优先领域/技术栈，必要时加学习方式或使用场景。',
  '例如 Java HashMap、ArrayList 的源码文章可共用「java」「源码阅读」，通常不新建 hashmap、resize、具体方法/API/错误码/版本等细标签；具体细节写进标题和摘要。示例不是固定分类清单。',
  '保存前先调用 trove_list_tags，优先复用合适的较宽标签。新建前判断是否能自然容纳多篇不同内容；已有细标签不等于应继续细分。批量采集先收敛共享主题，再逐条分配。用户明确要求细分时尊重其选择。',
  '不把所有内容泛化为「技术」「学习」；系统没有预设分类清单，也不做服务端语义映射。',
].join('\n');

/**
 * 注册全部 MCP 工具。
 * 统一返回 `{ content: [{ type: 'text', text }] }`，错误用 isError + 结构化 JSON。
 */
export function registerTroveTools(server: {
  registerTool: (
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: z.ZodType;
    },
    cb: (args: never, ctx: unknown) => Promise<unknown>,
  ) => void;
}) {
  const search = server.registerTool.bind(server);

  search(
    'trove_search',
    {
      title: '检索收藏',
      description:
        '按关键词、域名、标签、内容形态、来源与状态检索收藏。标签参数可重复传入（AND 语义）。',
      inputSchema: searchSchema,
    },
    (async (args: z.infer<typeof searchSchema>, ctx: unknown) => {
      const auth = authFromContext(ctx);
      try {
        const service = serviceContext(auth);
        const result = await listItems(service, {
          q: args.q,
          domain: args.domain,
          tags: args.tags,
          content_type: args.content_type as ContentType | undefined,
          source: args.source as ItemSource | undefined,
          status: args.status ?? 'active',
          read: args.read ?? 'all',
          overdue: args.overdue ?? false,
          limit: args.limit ?? 50,
        });
        return toolOk(
          result.items.map((i) => ({
            id: i.id,
            title: i.title,
            url: i.url,
            domain: i.domain,
            summary: i.summary,
            tags: (i.tags ?? []).map((t) => t.name),
            content_type: i.content_type,
            status: i.status,
            collected_at: i.collected_at,
            read_at: i.read_at,
            click_count: i.click_count,
          })),
        );
      } catch (e) {
        const err = toAppError(e);
        return toolError(err.code, err.message, err.details);
      }
    }) as never,
  );

  search(
    'trove_get',
    {
      title: '查看收藏详情',
      description:
        '按 id 读取一条收藏的完整信息，含标签、全部笔记与最近点击记录。',
      inputSchema: z.object({ id: z.string().uuid() }),
    },
    (async (args: { id: string }, ctx: unknown) => {
      const auth = authFromContext(ctx);
      try {
        const service = serviceContext(auth);
        const { item, notes } = await getItem(service, args.id);
        const clicks = await service.db.listClicks(args.id, 20);
        return toolOk({ item, notes, clicks });
      } catch (e) {
        const err = toAppError(e);
        return toolError(err.code, err.message, err.details);
      }
    }) as never,
  );

  search(
    'trove_save',
    {
      title: '保存收藏',
      description: `保存一条收藏（upsert）。\n${AI_GUIDANCE}`,
      inputSchema: saveItemSchema,
    },
    (async (args: z.infer<typeof saveItemSchema>, ctx: unknown) => {
      const auth = authFromContext(ctx);
      try {
        if (!auth.scopes.includes('items:write')) {
          return toolError('FORBIDDEN', '缺少 items:write 权限');
        }
        const service = serviceContext(auth);
        const result = await saveItem(service, args as SaveItemInput);
        return toolOk(result);
      } catch (e) {
        const err = toAppError(e);
        return toolError(err.code, err.message, err.details);
      }
    }) as never,
  );

  search(
    'trove_save_many',
    {
      title: '批量保存收藏',
      description: `批量保存（最多 50 条）。单条失败不影响其余。\n${AI_GUIDANCE}`,
      inputSchema: z.object({ items: z.array(saveItemSchema).min(1).max(50) }),
    },
    (async (
      args: { items: Array<z.infer<typeof saveItemSchema>> },
      ctx: unknown,
    ) => {
      const auth = authFromContext(ctx);
      try {
        if (!auth.scopes.includes('items:write')) {
          return toolError('FORBIDDEN', '缺少 items:write 权限');
        }
        const service = serviceContext(auth);
        return toolOk(await saveItems(service, args.items as SaveItemInput[]));
      } catch (e) {
        const err = toAppError(e);
        return toolError(err.code, err.message, err.details);
      }
    }) as never,
  );

  search(
    'trove_update',
    {
      title: '更新收藏',
      description: `更新一条收藏的可改字段。传 tags 即整体替换标签集合；不传则保持原样。\n${AI_GUIDANCE}`,
      inputSchema: z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(300).optional(),
        summary: z.string().max(1000).optional(),
        tags: z.array(z.string()).max(3).optional(),
        content_type: contentTypeEnum.optional(),
        status: z.enum(['active', 'archived']).optional(),
        read: z.boolean().optional(),
        notes: z.string().max(50000).optional(),
        notes_mode: z.enum(['append', 'replace']).optional(),
      }),
    },
    (async (args: Record<string, unknown>, ctx: unknown) => {
      const auth = authFromContext(ctx);
      try {
        if (!auth.scopes.includes('items:write')) {
          return toolError('FORBIDDEN', '缺少 items:write 权限');
        }
        const service = serviceContext(auth);
        const { id, ...rest } = args;
        return toolOk(await updateItem(service, String(id), rest as never));
      } catch (e) {
        const err = toAppError(e);
        return toolError(err.code, err.message, err.details);
      }
    }) as never,
  );

  search(
    'trove_archive',
    {
      title: '归档 / 取消归档',
      description:
        '批量归档或取消归档。归档的条目不再出现在默认列表与待读清单中。',
      inputSchema: z.object({
        ids: z.array(z.string().uuid()).min(1),
        archived: z.boolean().default(true),
      }),
    },
    (async (args: { ids: string[]; archived: boolean }, ctx: unknown) => {
      const auth = authFromContext(ctx);
      try {
        if (!auth.scopes.includes('items:write')) {
          return toolError('FORBIDDEN', '缺少 items:write 权限');
        }
        const service = serviceContext(auth);
        let updated = 0;
        const errors: Array<{ id: string; code: string; message: string }> = [];
        for (const id of args.ids) {
          try {
            await updateItem(service, id, {
              status: args.archived ? 'archived' : 'active',
            });
            updated += 1;
          } catch (e) {
            const err = toAppError(e);
            errors.push({ id, code: err.code, message: err.message });
          }
        }
        return toolOk({ updated, errors });
      } catch (e) {
        const err = toAppError(e);
        return toolError(err.code, err.message, err.details);
      }
    }) as never,
  );

  search(
    'trove_delete',
    {
      title: '删除收藏',
      description:
        '彻底删除一条收藏（笔记与点击记录一并删除）。归档是可逆的替代方案。',
      inputSchema: z.object({ id: z.string().uuid() }),
    },
    (async (args: { id: string }, ctx: unknown) => {
      const auth = authFromContext(ctx);
      try {
        if (!auth.scopes.includes('items:write')) {
          return toolError('FORBIDDEN', '缺少 items:write 权限');
        }
        const service = serviceContext(auth);
        await deleteItem(service, args.id);
        return toolOk({ deleted: true });
      } catch (e) {
        const err = toAppError(e);
        return toolError(err.code, err.message, err.details);
      }
    }) as never,
  );

  search(
    'trove_add_note',
    {
      title: '添加笔记',
      description: '为一条收藏追加一条 Markdown 笔记（可多条，历史可追溯）。',
      inputSchema: z.object({
        id: z.string().uuid(),
        body_md: z.string().min(1).max(50000),
      }),
    },
    (async (args: { id: string; body_md: string }, ctx: unknown) => {
      const auth = authFromContext(ctx);
      try {
        if (!auth.scopes.includes('notes:write')) {
          return toolError('FORBIDDEN', '缺少 notes:write 权限');
        }
        const service = serviceContext(auth);
        return toolOk({ note: await addNote(service, args.id, args.body_md) });
      } catch (e) {
        const err = toAppError(e);
        return toolError(err.code, err.message, err.details);
      }
    }) as never,
  );

  search(
    'trove_mark_read',
    {
      title: '标记已读 / 未读',
      description:
        '把收藏标记为已读（read_at）或未读（read_at 清空）。标记未读会让它重新进入待读候选。',
      inputSchema: z.object({
        id: z.string().uuid(),
        read: z.boolean().default(true),
      }),
    },
    (async (args: { id: string; read: boolean }, ctx: unknown) => {
      const auth = authFromContext(ctx);
      try {
        if (!auth.scopes.includes('items:write')) {
          return toolError('FORBIDDEN', '缺少 items:write 权限');
        }
        const service = serviceContext(auth);
        const item = await updateItem(service, args.id, { read: args.read });
        return toolOk({ id: item.id, read_at: item.read_at });
      } catch (e) {
        const err = toAppError(e);
        return toolError(err.code, err.message, err.details);
      }
    }) as never,
  );

  search(
    'trove_stats',
    {
      title: '统计概览',
      description: '返回总数、未读数、超期数、标签分布、来源分布与常用域名。',
      inputSchema: z.object({}),
    },
    (async (_args: unknown, ctx: unknown) => {
      const auth = authFromContext(ctx);
      try {
        const service = serviceContext(auth);
        return toolOk(await getStats(service));
      } catch (e) {
        const err = toAppError(e);
        return toolError(err.code, err.message, err.details);
      }
    }) as never,
  );

  search(
    'trove_list_reminders',
    {
      title: '待读清单',
      description: '返回超期未读的收藏（收藏时间超过阈值且从未打开过）。',
      inputSchema: z.object({}),
    },
    (async (_args: unknown, ctx: unknown) => {
      const auth = authFromContext(ctx);
      try {
        const service = serviceContext(auth);
        const reminders = await listReminders(service);
        return toolOk(
          reminders.map((r) => ({
            id: r.item.id,
            title: r.item.title,
            url: r.item.url,
            tags: (r.item.tags ?? []).map((t) => t.name),
            collected_at: r.item.collected_at,
            days_overdue: r.days_overdue,
          })),
        );
      } catch (e) {
        const err = toAppError(e);
        return toolError(err.code, err.message, err.details);
      }
    }) as never,
  );

  search(
    'trove_account',
    {
      title: '账号信息',
      description:
        '返回当前账号信息：邮箱、昵称、GitHub 用户名与头像。GitHub 用户名可用于读取该用户的 star 列表（公开端点，无需 Token）。',
      inputSchema: z.object({}),
    },
    (async (_args: unknown, ctx: unknown) => {
      const auth = authFromContext(ctx);
      try {
        const service = serviceContext(auth);
        return toolOk(await getAccountInfo(service));
      } catch (e) {
        const err = toAppError(e);
        return toolError(err.code, err.message, err.details);
      }
    }) as never,
  );

  search(
    'trove_list_tags',
    {
      title: '列出标签',
      description:
        '返回当前用户全部标签（含使用计数与来源）。保存前先调用它，优先复用语义合适的较宽主题。标签应聚合多篇内容，不因已有细标签而继续按类名、方法名或单篇问题细分。',
      inputSchema: z.object({}),
    },
    (async (_args: unknown, ctx: unknown) => {
      const auth = authFromContext(ctx);
      try {
        const service = serviceContext(auth);
        const tags = await listTags(service);
        return toolOk(
          tags.map((t) => ({
            id: t.id,
            name: t.name,
            count: t.count ?? 0,
            origin: t.origin,
          })),
        );
      } catch (e) {
        const err = toAppError(e);
        return toolError(err.code, err.message, err.details);
      }
    }) as never,
  );

  search(
    'trove_manage_tag',
    {
      title: '管理标签',
      description:
        '新建 / 改名 / 删除标签。改名只影响标签名，已绑定收藏的关系不变；删除会把该标签从所有收藏上解绑。',
      inputSchema: z.object({
        action: z.enum(['create', 'rename', 'delete']),
        name: z.string().optional(),
        new_name: z.string().optional(),
        tag_id: z.string().uuid().optional(),
      }),
    },
    (async (
      args: {
        action: 'create' | 'rename' | 'delete';
        name?: string;
        new_name?: string;
        tag_id?: string;
      },
      ctx: unknown,
    ) => {
      const auth = authFromContext(ctx);
      try {
        if (!auth.scopes.includes('items:write')) {
          return toolError('FORBIDDEN', '缺少 items:write 权限');
        }
        const service = serviceContext(auth);

        if (args.action === 'create') {
          if (!args.name) return toolError('VALIDATION_ERROR', '缺少 name');
          const { tag, created } = await createTag(service, args.name);
          return toolOk({ tag, created });
        }

        if (args.action === 'rename') {
          if (!args.tag_id) return toolError('VALIDATION_ERROR', '缺少 tag_id');
          if (!args.new_name)
            return toolError('VALIDATION_ERROR', '缺少 new_name');
          return toolOk({
            tag: await renameTag(service, args.tag_id, args.new_name),
          });
        }

        if (!args.tag_id) return toolError('VALIDATION_ERROR', '缺少 tag_id');
        const { unbound } = await deleteTag(service, args.tag_id);
        return toolOk({ deleted: true, unbound });
      } catch (e) {
        const err = toAppError(e);
        return toolError(err.code, err.message, err.details);
      }
    }) as never,
  );
}
