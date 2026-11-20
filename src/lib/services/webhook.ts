import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { AppError } from '@/lib/domain/errors';
import type { Item, Note } from '@/types';
import type { ServiceContext } from './context';

export const WEBHOOK_EVENTS = ['item.created', 'item.updated', 'item.archived', 'note.changed'] as const;
export type WebhookEvent = typeof WEBHOOK_EVENTS[number];
const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix, 'ipv4');

export function validateWebhookUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (value.length > 2048 || url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error();
    return url;
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Webhook 地址必须是有效的 HTTPS URL，且不能包含用户名、密码或片段');
  }
}
export function isPublicWebhookAddress(address: string): boolean {
  return isIP(address) === 4 && !blocked.check(address, 'ipv4');
}
export async function deliverWebhook(url: string, event: WebhookEvent | 'item.sync' | 'webhook.test', item?: Item, tags: string[] = [], notes: Note[] = []): Promise<void> {
  const target = validateWebhookUrl(url);
  const addresses = await Promise.race([
    lookup(target.hostname, { all: true, family: 4 }),
    new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('DNS timeout')), 5000); timer.unref(); }),
  ]);
  if (!addresses.length || addresses.some(({ address }) => !isPublicWebhookAddress(address))) throw new Error('Invalid webhook address');
  let data: Omit<Item, 'user_id'> | undefined;
  if (item) { const { user_id: userId, ...rest } = item; void userId; data = rest; }
  const body = JSON.stringify({ event, sent_at: new Date().toISOString(), ...(data ? { item: { ...data, tags, notes: notes.map(({ id, body_md, created_at, updated_at }) => ({ id, body_md, created_at, updated_at })) } } : {}) });
  await new Promise<void>((resolve, reject) => {
    const req = request(target, {
      method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-catchlinger-event': event },
      lookup: (_hostname, _options, callback) => callback(null, addresses[0].address, 4), signal: AbortSignal.timeout(5000),
    }, (res) => { res.resume(); if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(); else reject(new Error('Webhook rejected')); });
    req.on('error', reject); req.end(body);
  });
}
export async function notifyWebhook(ctx: ServiceContext, itemId: string, event: WebhookEvent): Promise<void> {
  try {
    const profile = await ctx.db.getProfile();
    if (!profile?.webhook_url || !(profile.webhook_events ?? WEBHOOK_EVENTS).includes(event)) return;
    const item = await ctx.db.getItem(itemId);
    if (!item) return;
    const [tagMap, notes] = await Promise.all([ctx.db.getTagsForItems([itemId]), ctx.db.listNotes(itemId)]);
    await deliverWebhook(profile.webhook_url, event, item, (tagMap.get(itemId) ?? []).map((tag) => tag.name), notes);
  } catch { console.error('Webhook delivery failed'); }
}
