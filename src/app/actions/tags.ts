'use server';

import { revalidatePath } from 'next/cache';

import { getServerContext } from '@/lib/server-context';
import { createTag, deleteTag, renameTag } from '@/lib/services/tags';
import { toAppError } from '@/lib/domain/errors';

export interface ActionResult {
  ok: boolean;
  error?: string;
  code?: string;
}

export async function createTagAction(name: string): Promise<ActionResult> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { ok: false, error: '需要登录' };
    await createTag(ctx, name);
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    const err = toAppError(e);
    return { ok: false, error: err.message, code: err.code };
  }
}

export async function renameTagAction(
  id: string,
  name: string,
): Promise<ActionResult> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { ok: false, error: '需要登录' };
    await renameTag(ctx, id, name);
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    const err = toAppError(e);
    return { ok: false, error: err.message, code: err.code };
  }
}

export async function deleteTagAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { ok: false, error: '需要登录' };
    await deleteTag(ctx, id);
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    const err = toAppError(e);
    return { ok: false, error: err.message, code: err.code };
  }
}
