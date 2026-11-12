'use server';

import { revalidatePath } from 'next/cache';

import { getServerContext } from '@/lib/server-context';
import { generateApiKey, DEFAULT_SCOPES } from '@/lib/auth/api-keys';
import { assertReminderDays } from '@/lib/domain/reminders';
import { toAppError } from '@/lib/domain/errors';

export interface ActionResult {
  ok: boolean;
  error?: string;
  code?: string;
}

/** 更新超期提醒天数阈值。 */
export async function updateReminderDaysAction(
  days: number,
): Promise<ActionResult> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { ok: false, error: '需要登录' };

    const value = assertReminderDays(days);
    await ctx.db.updateProfile({ reminder_days: value });

    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    const err = toAppError(e);
    return { ok: false, error: err.message, code: err.code };
  }
}

export interface CreatedKeyResult extends ActionResult {
  plaintext?: string;
}

/**
 * 生成 API Key。
 * 明文只在本次响应里返回一次，服务端只保存哈希。
 */
export async function createApiKeyAction(name: string): Promise<CreatedKeyResult> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { ok: false, error: '需要登录' };

    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: '请填写用途名称' };

    const { plaintext, prefix, hash } = generateApiKey();
    await ctx.db.createApiKey(trimmed, prefix, hash, [...DEFAULT_SCOPES]);

    revalidatePath('/settings');
    return { ok: true, plaintext };
  } catch (e) {
    const err = toAppError(e);
    return { ok: false, error: err.message, code: err.code };
  }
}

/** 吊销 API Key（即时生效）。 */
export async function revokeApiKeyAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { ok: false, error: '需要登录' };

    const ok = await ctx.db.revokeApiKey(id);
    if (!ok) return { ok: false, error: 'API Key 不存在' };

    revalidatePath('/settings');
    return { ok: true };
  } catch (e) {
    const err = toAppError(e);
    return { ok: false, error: err.message, code: err.code };
  }
}
