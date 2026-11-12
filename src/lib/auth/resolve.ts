import { createServerSupabaseClient } from '@/lib/supabase/server';
import { TroveDb } from '@/lib/db/trove-db';
import { hashApiKey, isApiKeyFormat, DEFAULT_SCOPES } from './api-keys';

export type AuthMode = 'api_key' | 'session';

export interface ResolvedAuth {
  userId: string;
  scopes: string[];
  mode: AuthMode;
  /** 会话模式下的会话客户端（RLS 保护）；API Key 模式为 undefined */
  sessionClient?: Awaited<ReturnType<typeof createServerSupabaseClient>>;
}

/**
 * 统一凭据解析（plan §3.3）：
 *   1. Authorization: Bearer trv_…  → API Key（长效，供 Skill / MCP / CLI 使用）
 *   2. 否则读会话 Cookie            → Supabase 会话（Web UI）
 *   3. 都没有                      → null（调用方返回 401）
 *
 * Supabase access_token 约 1 小时过期，无法作为 MCP 静态请求头，
 * 所以 Skill / MCP 必须使用长效 API Key。
 */
export async function resolveAuth(req: Request): Promise<ResolvedAuth | null> {
  const header = req.headers.get('authorization');

  if (header?.toLowerCase().startsWith('bearer ')) {
    const token = header.slice(7).trim();

    if (isApiKeyFormat(token)) {
      const record = await TroveDb.findApiKeyByHash(hashApiKey(token));
      if (!record) return null;

      // 使用时间只是辅助信息，不阻塞主流程
      void TroveDb.markApiKeyUsed(record.id);

      return {
        userId: record.user_id,
        scopes: record.scopes?.length ? record.scopes : [...DEFAULT_SCOPES],
        mode: 'api_key',
      };
    }

    // Bearer 的是 Supabase JWT：交给会话客户端校验
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return {
      userId: user.id,
      scopes: [...DEFAULT_SCOPES],
      mode: 'session',
      sessionClient: supabase,
    };
  }

  // Cookie 会话
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return {
      userId: user.id,
      scopes: [...DEFAULT_SCOPES],
      mode: 'session',
      sessionClient: supabase,
    };
  } catch {
    return null;
  }
}

export function hasScope(auth: ResolvedAuth, scope: string): boolean {
  return auth.scopes.includes(scope);
}
