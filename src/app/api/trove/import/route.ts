import { withAuth, readJson } from '@/lib/http';
import { AppError } from '@/lib/domain/errors';
import { saveItem, type SaveItemInput } from '@/lib/services/items';
import { addNote } from '@/lib/services/notes';
import { createTag } from '@/lib/services/tags';

interface ImportPayload {
  mode?: 'merge' | 'replace';
  tags?: Array<{ name?: string }>;
  items?: Array<{
    url?: string;
    title?: string;
    summary?: string;
    tags?: string[];
    content_type?: SaveItemInput['content_type'];
    source?: SaveItemInput['source'];
    source_ref?: string;
    collected_at?: string;
    notes?: Array<{ body_md?: string }>;
  }>;
}

/**
 * POST /api/trove/import —— 从导出文件恢复。
 *
 * merge（默认）：按 normalized_url upsert，不覆盖已存在的 collected_at / status / read_at
 * replace：先清空当前用户的全部收藏再写入
 */
export async function POST(req: Request) {
  return withAuth(req, async (ctx) => {
    const body = await readJson(req);
    const payload = body as ImportPayload;

    const mode = payload.mode ?? 'merge';
    if (mode !== 'merge' && mode !== 'replace') {
      throw new AppError('VALIDATION_ERROR', 'mode 只能是 merge 或 replace');
    }

    const items = payload.items ?? [];
    if (!Array.isArray(items)) {
      throw new AppError('VALIDATION_ERROR', 'items 必须是数组');
    }

    if (mode === 'replace') {
      await ctx.db.deleteAllItems();
    }

    // 先把标签建出来，避免每条 item 都触发一次「建标签」
    for (const t of payload.tags ?? []) {
      if (t?.name) await createTag(ctx, t.name);
    }

    let created = 0;
    let updated = 0;
    const errors: Array<{ index: number; code: string; message: string }> = [];

    for (let i = 0; i < items.length; i += 1) {
      const raw = items[i];
      try {
        const result = await saveItem(ctx, {
          url: String(raw.url ?? ''),
          title: raw.title,
          summary: raw.summary,
          tags: raw.tags,
          content_type: raw.content_type,
          source: raw.source,
          source_ref: raw.source_ref,
        });

        if (result.created) created += 1;
        else updated += 1;

        for (const n of raw.notes ?? []) {
          if (n?.body_md) await addNote(ctx, result.id, n.body_md);
        }
      } catch (e) {
        const err = e instanceof AppError ? e : new AppError('INTERNAL', '导入失败');
        errors.push({ index: i, code: err.code, message: err.message });
      }
    }

    return { mode, created, updated, errors };
  });
}
