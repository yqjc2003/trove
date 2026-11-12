'use server';

import { revalidatePath } from 'next/cache';

import { getServerContext } from '@/lib/server-context';
import { updateItem, deleteItem, saveItem } from '@/lib/services/items';
import { toAppError } from '@/lib/domain/errors';

export interface ActionResult {
  ok: boolean;
  error?: string;
  code?: string;
}

export interface CreateItemResult extends ActionResult {
  id?: string;
}

function revalidateAll() {
  revalidatePath('/', 'layout');
}

/**
 * Web 手工添加一条收藏。
 *
 * 标签**不限数量**：3 个上限只针对 Agent 通道（MCP / Skill / REST），
 * 防止 AI 乱贴标签；Web 是人工整理，走会话通道，服务端也放行。
 */
export async function createItemAction(input: {
  url: string;
  title: string;
  summary?: string;
  tags?: string[];
}): Promise<CreateItemResult> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { ok: false, error: '需要登录' };

    const result = await saveItem(
      ctx,
      {
        url: input.url,
        title: input.title,
        summary: input.summary,
        tags: input.tags,
        source: 'manual',
      },
      { maxTags: null },
    );

    revalidateAll();
    return { ok: true, id: result.id };
  } catch (e) {
    const err = toAppError(e);
    return { ok: false, error: err.message, code: err.code };
  }
}

export async function setItemTagsAction(
  id: string,
  tags: string[],
): Promise<ActionResult> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { ok: false, error: '需要登录' };
    // Web 手工整理不限标签数量
    await updateItem(ctx, id, { tags }, { maxTags: null });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    const err = toAppError(e);
    return { ok: false, error: err.message, code: err.code };
  }
}

export async function setItemStatusAction(
  id: string,
  status: 'active' | 'archived',
): Promise<ActionResult> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { ok: false, error: '需要登录' };
    await updateItem(ctx, id, { status });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    const err = toAppError(e);
    return { ok: false, error: err.message, code: err.code };
  }
}

export async function setItemReadAction(
  id: string,
  read: boolean,
): Promise<ActionResult> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { ok: false, error: '需要登录' };
    await updateItem(ctx, id, { read });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    const err = toAppError(e);
    return { ok: false, error: err.message, code: err.code };
  }
}

export async function removeItemAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { ok: false, error: '需要登录' };
    await deleteItem(ctx, id);
    revalidateAll();
    return { ok: true };
  } catch (e) {
    const err = toAppError(e);
    return { ok: false, error: err.message, code: err.code };
  }
}

export async function updateItemFieldsAction(
  id: string,
  fields: { title?: string; summary?: string },
): Promise<ActionResult> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { ok: false, error: '需要登录' };
    await updateItem(ctx, id, fields);
    revalidateAll();
    return { ok: true };
  } catch (e) {
    const err = toAppError(e);
    return { ok: false, error: err.message, code: err.code };
  }
}
