import { withAuth, readJson, queryList } from '@/lib/http';
import { listItems, saveItems, type SaveItemInput } from '@/lib/services/items';
import { AppError } from '@/lib/domain/errors';
import { assertBatchSize, clampLimit, clampOffset } from '@/lib/domain/validation';
import { isContentType } from '@/lib/domain/content-type';
import type { ItemFilters, ItemSource } from '@/types';

const SOURCES: ItemSource[] = ['manual', 'skill', 'mcp', 'github', 'bookmark'];

/** GET /api/trove/items —— 列表 + 检索 */
export async function GET(req: Request) {
  return withAuth(req, async (ctx) => {
    const params = new URL(req.url).searchParams;

    const filters: ItemFilters = {
      q: params.get('q') ?? undefined,
      domain: params.get('domain') ?? undefined,
      tags: queryList(params, 'tag'),
      content_type: (() => {
        const v = params.get('content_type');
        return v && isContentType(v) ? v : undefined;
      })(),
      source: (() => {
        const v = params.get('source') as ItemSource | null;
        return v && SOURCES.includes(v) ? v : undefined;
      })(),
      status: (() => {
        const v = params.get('status');
        return v === 'archived' || v === 'all' ? v : 'active';
      })(),
      read: (() => {
        const v = params.get('read');
        return v === 'read' || v === 'unread' ? v : 'all';
      })(),
      overdue: params.get('overdue') === 'true',
      collected_from: params.get('collected_from') ?? undefined,
      collected_to: params.get('collected_to') ?? undefined,
      sort: (() => {
        const v = params.get('sort');
        return v === 'click_count' || v === 'title' ? v : 'collected_at';
      })(),
      order: params.get('order') === 'asc' ? 'asc' : 'desc',
      limit: clampLimit(params.get('limit')),
      offset: clampOffset(params.get('offset')),
    };

    return listItems(ctx, filters);
  });
}

/** POST /api/trove/items —— 单条或批量 upsert */
export async function POST(req: Request) {
  return withAuth(req, async (ctx) => {
    const body = await readJson(req);

    const rawItems = Array.isArray(body.items) ? body.items : [body];
    assertBatchSize(rawItems.length);

    const inputs: SaveItemInput[] = rawItems.map((raw) => {
      if (!raw || typeof raw !== 'object') {
        throw new AppError('VALIDATION_ERROR', 'items 里的每一项都必须是对象');
      }
      const o = raw as Record<string, unknown>;
      return {
        url: String(o.url ?? ''),
        title: o.title === undefined ? undefined : String(o.title),
        summary: o.summary === undefined ? undefined : String(o.summary),
        tags: o.tags === undefined ? undefined : (o.tags as string[]),
        content_type: o.content_type as SaveItemInput['content_type'],
        source: o.source as SaveItemInput['source'],
        source_ref: o.source_ref === undefined ? undefined : String(o.source_ref),
        content_excerpt:
          o.content_excerpt === undefined ? undefined : String(o.content_excerpt),
        notes: o.notes === undefined ? undefined : String(o.notes),
      };
    });

    return saveItems(ctx, inputs);
  });
}
