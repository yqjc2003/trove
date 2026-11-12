import { protectedResourceHandler } from 'mcp-handler';

export const dynamic = 'force-dynamic';

/**
 * RFC 9728 Protected Resource Metadata。
 * MCP 客户端在收到 401 挑战时会来读这个文档。
 */
const handler = protectedResourceHandler({
  authServerUrls: [],
});

export { handler as GET };
