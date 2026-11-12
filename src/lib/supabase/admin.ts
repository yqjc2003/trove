import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { AppError } from '@/lib/domain/errors';

let cached: SupabaseClient | null = null;

/**
 * service-role 客户端：绕过 RLS，**仅限服务端使用**。
 * 绝不能出现在任何 NEXT_PUBLIC_* 变量里，也不能被客户端组件引用。
 */
export function createAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new AppError(
      'INTERNAL',
      '缺少 Supabase 服务端环境变量（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）',
    );
  }

  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return cached;
}
