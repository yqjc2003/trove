import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { capture, localEndpoint } from '../../skills/catch-and-linger/scripts/capture.mjs';

describe('本地收录 Skill', () => {
  it('拒绝远程或带凭据的 MCP 地址', () => {
    expect(() => localEndpoint('https://example.com/mcp')).toThrow();
    expect(() => localEndpoint('http://127.0.0.1.evil.example/mcp')).toThrow();
    expect(() => localEndpoint('http://user:pass@127.0.0.1/mcp')).toThrow();
    expect(localEndpoint('http://127.0.0.1:46917/mcp')).toBe('http://127.0.0.1:46917/mcp');
  });

  it('通过 MCP 握手逐项收录并报告重复项目', async () => {
    const methods: string[] = [];
    const server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        const message = JSON.parse(raw); methods.push(message.method);
        if (req.headers.authorization !== 'Bearer test-token') { res.writeHead(403).end(); return; }
        if (!('id' in message)) { res.writeHead(202).end(); return; }
        const result = message.method === 'tools/call'
          ? { content: [{ type: 'text', text: JSON.stringify({ url: message.params.arguments.url, status: message.id === 2 ? 'created' : 'exists' }) }] }
          : { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'test', version: '1' } };
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('本地测试服务启动失败');
    const previousToken = process.env.CATCHLINGER_MCP_TOKEN;
    const previousUrl = process.env.CATCHLINGER_MCP_URL;
    process.env.CATCHLINGER_MCP_TOKEN = 'test-token';
    process.env.CATCHLINGER_MCP_URL = `http://127.0.0.1:${address.port}/mcp`;
    try {
      const results = await capture(['https://example.com/a', 'https://example.com/b']);
      expect(results.map((result: { status: string }) => result.status)).toEqual(['created', 'exists']);
      expect(methods).toEqual(['initialize', 'notifications/initialized', 'tools/call', 'tools/call']);
    } finally {
      if (previousToken === undefined) delete process.env.CATCHLINGER_MCP_TOKEN; else process.env.CATCHLINGER_MCP_TOKEN = previousToken;
      if (previousUrl === undefined) delete process.env.CATCHLINGER_MCP_URL; else process.env.CATCHLINGER_MCP_URL = previousUrl;
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
