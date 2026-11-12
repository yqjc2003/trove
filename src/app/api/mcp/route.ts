import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import type { AuthInfo } from '@modelcontextprotocol/server';

import { registerTroveTools } from '@/lib/mcp/server';
import { TroveDb } from '@/lib/db/trove-db';
import { hashApiKey, isApiKeyFormat, DEFAULT_SCOPES } from '@/lib/auth/api-keys';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const REQUIRED_SCOPES = ['items:read', 'items:write'];

/**
 * 校验 Bearer 凭据。
 *
 * - `trv_…` 开头的长效 API Key（Skill / MCP / CLI 用）
 * - 同源 Cookie 会话（WebMCP 桥接场景）
 */
async function verifyToken(
  req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (bearerToken && isApiKeyFormat(bearerToken)) {
    const record = await TroveDb.findApiKeyByHash(hashApiKey(bearerToken));
    if (!record) return undefined;

    void TroveDb.markApiKeyUsed(record.id);

    return {
      token: bearerToken,
      clientId: 'trove-api-key',
      scopes: record.scopes?.length ? record.scopes : [...DEFAULT_SCOPES],
      extra: { userId: record.user_id },
    };
  }

  // 同源 Cookie 会话：只信任 same-origin 请求，避免 CSRF 借用
  if (req.headers.get('sec-fetch-site') !== 'same-origin') return undefined;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return undefined;

    return {
      token: 'session',
      clientId: user.id,
      scopes: [...DEFAULT_SCOPES],
      extra: { userId: user.id, authMethod: 'cookie' },
    };
  } catch {
    return undefined;
  }
}

const handler = createMcpHandler((server) => {
  registerTroveTools(server as never);
});

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: REQUIRED_SCOPES,
  resourceMetadataPath: '/.well-known/oauth-protected-resource',
});

export { authHandler as GET, authHandler as POST };
