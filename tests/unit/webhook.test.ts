import { describe, expect, it, vi } from 'vitest';
import * as webhook from '@/lib/services/webhook';
import { saveItem, updateItem } from '@/lib/services/items';
import { addNote, updateNote, deleteNote } from '@/lib/services/notes';
import { FakeTroveDb, fakeContext } from '../helpers/fake-db';

describe('Webhook', () => {
  it('validates HTTPS URLs and public addresses', () => {
    expect(webhook.validateWebhookUrl('https://example.com/hook').hostname).toBe('example.com');
    for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/#x', 'invalid']) expect(() => webhook.validateWebhookUrl(url)).toThrow();
    for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '100.64.0.1', '::1']) expect(webhook.isPublicWebhookAddress(ip)).toBe(false);
    expect(webhook.isPublicWebhookAddress('8.8.8.8')).toBe(true);
  });
  it('emits events for saves, updates, archiving and note changes', async () => {
    const notify = vi.spyOn(webhook, 'notifyWebhook').mockResolvedValue();
    const db = new FakeTroveDb(); const ctx = fakeContext(db);
    const item = await saveItem(ctx, { url: 'https://example.com', title: 'One' });
    await saveItem(ctx, { url: 'https://example.com', title: 'Two' });
    await updateItem(ctx, item.id, { status: 'archived' });
    const note = await addNote(ctx, item.id, 'note');
    await updateNote(ctx, note.id, 'edit'); await deleteNote(ctx, note.id);
    expect(notify.mock.calls.map((call) => call[2])).toEqual(['item.created', 'item.updated', 'item.archived', 'note.changed', 'note.changed', 'note.changed']);
    notify.mockRestore();
  });
  it('does not fail a save when configuration lookup fails', async () => {
    const db = new FakeTroveDb(); vi.spyOn(db, 'getProfile').mockRejectedValue(new Error('unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await saveItem(fakeContext(db), { url: 'https://example.com', title: 'Test' });
    expect(result.created).toBe(true); expect(log).toHaveBeenCalled(); log.mockRestore();
  });
});
