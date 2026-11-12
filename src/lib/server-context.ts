import { createServerSupabaseClient } from '@/lib/supabase/server';
import { TroveDb } from '@/lib/db/trove-db';
import { DEFAULT_SCOPES } from '@/lib/auth/api-keys';
import type { ServiceContext } from '@/lib/services/context';

/**
 * SSR 读取用的服务上下文。
 *
 * 用会话客户端（RLS 保护）+ TroveDb 强制 user_id 过滤，双重保险。
 * 未登录返回 null，调用方负责跳转 /login。
 */
export async function getServerContext(): Promise<ServiceContext | null> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return {
    db: TroveDb.forSession(user.id, supabase),
    userId: user.id,
    scopes: [...DEFAULT_SCOPES],
  };
}
