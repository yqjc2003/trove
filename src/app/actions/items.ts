'use server';

import { revalidatePath } from 'next/cache';

import { getServerContext } from '@/lib/server-context';
import { updateItem, deleteItem } from '@/lib/services/items';
import { toAppError } from '@/lib/domain/errors';

export interface ActionResult {
  ok: boolean;
  error?: string;
  code?: string;
}

function revalidateAll() {
  revalidatePath('/', 'layout');
}

export async function setItemTagsAction(
  id: string,
  tags: string[],
): Promise<ActionResult> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { ok: false, error: '需要登录' };
    await updateItem(ctx, id, { tags });
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
