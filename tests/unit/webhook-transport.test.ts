import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const mocks = vi.hoisted(() => ({ request: vi.fn(), lookup: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
import { deliverWebhook } from '@/lib/services/webhook';

describe('webhook transport', () => {
  it('pins an IPv4 connection using the single-address DNS callback', async () => {
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    mocks.request.mockImplementation((_url, options, onResponse) => {
      expect(options.family).toBe(4);
      const callback = vi.fn();
      options.lookup('example.com', { family: 4 }, callback);
      expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = () => onResponse({ statusCode: 200, resume() {} });
      return req;
    });
    await expect(deliverWebhook('https://example.com/hook', 'webhook.test')).resolves.toBeUndefined();
  });
});
