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

/** 设置或关闭当前用户的 Webhook。 */
export async function updateWebhookAction(raw: string, events: string[]): Promise<ActionResult> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { ok: false, error: '需要登录' };
    const { validateWebhookUrl, WEBHOOK_EVENTS } = await import('@/lib/services/webhook');
    if (!Array.isArray(events) || events.some((event) => !WEBHOOK_EVENTS.includes(event as typeof WEBHOOK_EVENTS[number]))) return { ok: false, error: '事件类型无效' };
    const url = raw.trim() ? validateWebhookUrl(raw.trim()).toString() : null;
    const profile = await ctx.db.updateProfile({ webhook_url: url, webhook_events: [...new Set(events)] });
    if (!profile) return { ok: false, error: '用户资料不存在' };
    revalidatePath('/settings');
    return { ok: true };
  } catch (e) { const err = toAppError(e); return { ok: false, error: err.message, code: err.code }; }
}
export async function testWebhookAction(): Promise<ActionResult> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { ok: false, error: '需要登录' };
    const profile = await ctx.db.getProfile();
    if (!profile?.webhook_url) return { ok: false, error: '请先保存 Webhook 地址' };
    const { deliverWebhook } = await import('@/lib/services/webhook');
    await deliverWebhook(profile.webhook_url, 'webhook.test');
    return { ok: true };
  } catch { return { ok: false, error: '连接失败：请检查地址、网络及端点响应' }; }
}
export async function syncWebhookBatchAction(offset: number): Promise<ActionResult & { sent?: number; failed?: number; processed?: number; more?: boolean }> {
  try {
    const ctx = await getServerContext();
    if (!ctx) return { ok: false, error: '需要登录' };
    if (!Number.isSafeInteger(offset) || offset < 0) return { ok: false, error: '同步位置无效' };
    const profile = await ctx.db.getProfile();
    if (!profile?.webhook_url) return { ok: false, error: '请先配置 Webhook 地址' };
    const { listItems } = await import('@/lib/services/items');
    const { deliverWebhook } = await import('@/lib/services/webhook');
    const result = await listItems(ctx, { status: 'all', limit: 10, offset, sort: 'collected_at', order: 'asc' });
    const outcomes = await Promise.all(result.items.map(async (item) => {
      try {
        const notes = await ctx.db.listNotes(item.id);
        await deliverWebhook(profile.webhook_url!, 'item.sync', item, (item.tags ?? []).map((tag) => tag.name), notes);
        return true;
      } catch { return false; }
    }));
    return { ok: true, sent: outcomes.filter(Boolean).length, failed: outcomes.filter((ok) => !ok).length, processed: outcomes.length, more: offset + outcomes.length < result.total && outcomes.length > 0 };
  } catch (e) { const err = toAppError(e); return { ok: false, error: err.message, code: err.code }; }
}
