import { AppError } from '@/lib/domain/errors';
import { normalizeTagName } from '@/lib/domain/tags';
import type { Tag } from '@/types';
import type { ServiceContext } from './context';

/** 标签列表（附使用计数）。每用户独立命名空间。 */
export async function listTags(ctx: ServiceContext): Promise<Tag[]> {
  const [tags, usage] = await Promise.all([
    ctx.db.listTags(),
    ctx.db.countTagUsage(),
  ]);

  return tags.map((t) => ({ ...t, count: usage.get(t.name) ?? 0 }));
}

/** 新建标签；同名已存在则幂等返回既有标签。 */
export async function createTag(
  ctx: ServiceContext,
  rawName: string,
): Promise<{ tag: Tag; created: boolean }> {
  const name = normalizeTagName(rawName);
  if (!name) {
    throw new AppError('VALIDATION_ERROR', '标签名不能为空');
  }

  const existing = await ctx.db.getTagByName(name);
  if (existing) return { tag: existing, created: false };

  const tag = await ctx.db.createTag(name, 'user');
  return { tag, created: true };
}

/**
 * 改名。`item_tags` 按 tag_id 关联，因此改名不影响任何绑定关系。
 * 与既有标签重名 → TAG_NAME_CONFLICT。
 */
export async function renameTag(
  ctx: ServiceContext,
  id: string,
  rawName: string,
): Promise<Tag> {
  const name = normalizeTagName(rawName);
  if (!name) {
    throw new AppError('VALIDATION_ERROR', '标签名不能为空');
  }

  const current = await ctx.db.getTag(id);
  if (!current) throw new AppError('NOT_FOUND', '标签不存在');

  const conflict = await ctx.db.getTagByName(name);
  if (conflict && conflict.id !== id) {
    throw new AppError('TAG_NAME_CONFLICT', '标签名已存在');
  }

  const renamed = await ctx.db.renameTag(id, name);
  if (!renamed) throw new AppError('NOT_FOUND', '标签不存在');
  return renamed;
}

/** 删除标签；返回被解绑的收藏数量。 */
export async function deleteTag(
  ctx: ServiceContext,
  id: string,
): Promise<{ unbound: number }> {
  const current = await ctx.db.getTag(id);
  if (!current) throw new AppError('NOT_FOUND', '标签不存在');

  const unbound = await ctx.db.deleteTag(id);
  return { unbound };
}
