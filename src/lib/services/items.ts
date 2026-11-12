import { AppError } from '@/lib/domain/errors';
import { detectContentType, isContentType, type ContentType } from '@/lib/domain/content-type';
import { normalizeUrl } from '@/lib/domain/url';
import { normalizeTags, normalizeTagFilters, DEFAULT_TAG_LIMIT, type TagLimit } from '@/lib/domain/tags';
import {
  MAX_EXCERPT_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_SUMMARY_LENGTH,
  MAX_TITLE_LENGTH,
  assertString,
  clampLimit,
  clampOffset,
} from '@/lib/domain/validation';
import type { Item, ItemFilters, ItemListResult, ItemSource, Note, Tag } from '@/types';
import type { ServiceContext } from './context';

export interface SaveItemInput {
  url: string;
  title?: string;
  summary?: string;
  tags?: string[];
  content_type?: ContentType;
  source?: ItemSource;
  source_ref?: string;
  content_excerpt?: string;
  notes?: string;
}

export interface SaveItemResult {
  id: string;
  created: boolean;
  normalized_url: string;
  domain: string;
  title: string;
  tags: string[];
}

export interface BatchSaveError {
  index: number;
  code: string;
  message: string;
}

export interface ItemWriteOptions {
  /**
   * 标签数量上限。
   *   · 省略 → Agent 通道的 3 个上限（REST / MCP / Skill 走这条）
   *   · `null` → 不限数量（Web 手工整理走这条）
   */
  maxTags?: TagLimit;
}

/** 区分「没传」与「显式传 null（不限）」。 */
function resolveTagLimit(opts?: ItemWriteOptions): TagLimit {
  if (!opts || opts.maxTags === undefined) return DEFAULT_TAG_LIMIT;
  return opts.maxTags;
}

export interface BatchSaveResult {
  items: SaveItemResult[];
  created: number;
  updated: number;
  errors: BatchSaveError[];
}

/**
 * 写入一条收藏（upsert 语义，plan §5.6）。
 *
 * 字段级规则：
 *   · 未提供的字段一律不写进 payload —— DB 侧用 `p_payload ? 'field'` 判断，
 *     从而做到「缺省 → 保留旧值」
 *   · 传了 tags → 整体替换；没传 → 原标签保留
 *   · collected_at / status / read_at / click_count 永不被覆盖
 */
export async function saveItem(
  ctx: ServiceContext,
  input: SaveItemInput,
  opts?: ItemWriteOptions,
): Promise<SaveItemResult> {
  // ── 1. 校验（先校验后写，任何一步失败都不会留下半成品）────────────────
  const { url, normalizedUrl, domain } = normalizeUrl(input.url);

  const title = assertString(input.title, 'title', {
    required: true,
    maxLength: MAX_TITLE_LENGTH,
  })!;

  const summary = assertString(input.summary, 'summary', {
    maxLength: MAX_SUMMARY_LENGTH,
  });

  // 标签归一 + 数量上限校验（超限直接抛错，此时尚未写任何东西）
  const tags = normalizeTags(input.tags, resolveTagLimit(opts));

  const excerpt = assertString(input.content_excerpt, 'content_excerpt', {
    maxLength: MAX_EXCERPT_LENGTH,
  });

  const noteBody = assertString(input.notes, 'notes', {
    maxLength: MAX_NOTE_LENGTH,
  });

  const explicitContentType = input.content_type;
  if (explicitContentType !== undefined && !isContentType(explicitContentType)) {
    throw new AppError('VALIDATION_ERROR', 'content_type 不合法');
  }
  const detectedContentType = explicitContentType ?? detectContentType(url);

  // ── 2. 组装 payload（未提供的字段不写 key）─────────────────────────
  const payload: Record<string, unknown> = {
    url,
    normalized_url: normalizedUrl,
    domain,
    title,
  };
  if (summary !== undefined) payload.summary = summary;
  if (excerpt !== undefined) payload.content_excerpt = excerpt;
  if (explicitContentType !== undefined) payload.content_type = explicitContentType;
  if (input.source !== undefined) payload.source = input.source;
  if (input.source_ref !== undefined) payload.source_ref = input.source_ref;

  // ── 3. upsert ──────────────────────────────────────────────────────
  const existing = await ctx.db.getItemByNormalizedUrl(normalizedUrl);
  const existed = existing !== null;

  // 新建时写入自动识别的 content_type；已有条目且调用方未指定 → 保留原值
  if (!existed && explicitContentType === undefined) {
    payload.content_type = detectedContentType;
  }

  const { item, created } = await ctx.db.upsertItem(payload, existed);

  // ── 4. 标签：传了才替换，没传保留原样 ────────────────────────────────
  let finalTags: Tag[];
  if (input.tags !== undefined) {
    finalTags = await ctx.db.replaceItemTags(item.id, tags, 'agent');
  } else {
    finalTags = (await ctx.db.getTagsForItems([item.id])).get(item.id) ?? [];
  }

  // ── 5. 笔记：追加而非覆盖 ──────────────────────────────────────────
  if (noteBody !== undefined && noteBody !== '') {
    await ctx.db.createNote(item.id, noteBody);
  }

  return {
    id: item.id,
    created,
    normalized_url: normalizedUrl,
    domain,
    title: item.title,
    tags: finalTags.map((t) => t.name),
  };
}

/** 批量写入：逐条独立执行，单条失败不阻断其余。 */
export async function saveItems(
  ctx: ServiceContext,
  inputs: SaveItemInput[],
  opts?: ItemWriteOptions,
): Promise<BatchSaveResult> {
  const items: SaveItemResult[] = [];
  const errors: BatchSaveError[] = [];
  let created = 0;
  let updated = 0;

  for (let i = 0; i < inputs.length; i += 1) {
    try {
      const result = await saveItem(ctx, inputs[i], opts);
      items.push(result);
      if (result.created) created += 1;
      else updated += 1;
    } catch (e) {
      const err = e instanceof AppError ? e : new AppError('INTERNAL', '写入失败');
      errors.push({ index: i, code: err.code, message: err.message });
    }
  }

  return { items, created, updated, errors };
}

export interface UpdateItemInput {
  title?: string;
  summary?: string;
  tags?: string[];
  content_type?: ContentType;
  status?: 'active' | 'archived';
  read?: boolean;
  notes?: string;
  notes_mode?: 'append' | 'replace';
}

export async function updateItem(
  ctx: ServiceContext,
  id: string,
  input: UpdateItemInput,
  opts?: ItemWriteOptions,
): Promise<Item> {
  const current = await ctx.db.getItem(id);
  if (!current) throw new AppError('NOT_FOUND', '收藏不存在');

  const patch: Partial<Item> = {};

  if (input.title !== undefined) {
    patch.title = assertString(input.title, 'title', {
      required: true,
      maxLength: MAX_TITLE_LENGTH,
    })!;
  }

  if (input.summary !== undefined) {
    const summary = assertString(input.summary, 'summary', {
      maxLength: MAX_SUMMARY_LENGTH,
    });
    patch.summary = summary ?? null;
  }

  if (input.content_type !== undefined) {
    if (!isContentType(input.content_type)) {
      throw new AppError('VALIDATION_ERROR', 'content_type 不合法');
    }
    patch.content_type = input.content_type;
  }

  if (input.status !== undefined) {
    if (input.status !== 'active' && input.status !== 'archived') {
      throw new AppError('VALIDATION_ERROR', 'status 不合法');
    }
    patch.status = input.status;
    patch.archived_at = input.status === 'archived' ? new Date().toISOString() : null;
  }

  if (input.read !== undefined) {
    patch.read_at = input.read ? (current.read_at ?? new Date().toISOString()) : null;
  }

  const updated =
    Object.keys(patch).length > 0 ? await ctx.db.updateItem(id, patch) : current;

  if (!updated) throw new AppError('NOT_FOUND', '收藏不存在');

  // 标签：传了才整体替换
  if (input.tags !== undefined) {
    const tags = normalizeTags(input.tags, resolveTagLimit(opts));
    await ctx.db.replaceItemTags(id, tags, 'user');
  }

  if (input.notes !== undefined) {
    const body = assertString(input.notes, 'notes', { maxLength: MAX_NOTE_LENGTH });
    if (body) {
      if (input.notes_mode === 'replace') {
        const existing = await ctx.db.listNotes(id);
        for (const n of existing) await ctx.db.deleteNote(n.id);
      }
      await ctx.db.createNote(id, body);
    }
  }

  const finalTags = (await ctx.db.getTagsForItems([id])).get(id) ?? [];
  return { ...updated, tags: finalTags };
}

export async function deleteItem(ctx: ServiceContext, id: string): Promise<boolean> {
  const ok = await ctx.db.deleteItem(id);
  if (!ok) throw new AppError('NOT_FOUND', '收藏不存在');
  return true;
}

export async function listItems(
  ctx: ServiceContext,
  filters: ItemFilters,
): Promise<ItemListResult> {
  const result = await ctx.db.listItems({
    ...filters,
    // 过滤条件与写入路径走同一套标签归一，否则 "React" 搜不到存成 "react" 的条目
    tags: normalizeTagFilters(filters.tags),
    limit: clampLimit(filters.limit),
    offset: clampOffset(filters.offset),
  });

  const tagMap = await ctx.db.getTagsForItems(result.items.map((i) => i.id));
  const items = result.items.map((i) => ({ ...i, tags: tagMap.get(i.id) ?? [] }));

  return { ...result, items };
}

export async function getItem(
  ctx: ServiceContext,
  id: string,
): Promise<{ item: Item; notes: Note[] }> {
  const item = await ctx.db.getItem(id);
  if (!item) throw new AppError('NOT_FOUND', '收藏不存在');
  const tagMap = await ctx.db.getTagsForItems([id]);
  const notes = await ctx.db.listNotes(id);
  return { item: { ...item, tags: tagMap.get(id) ?? [] }, notes };
}
