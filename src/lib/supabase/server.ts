import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { AppError } from '@/lib/domain/errors';

/** Supabase 服务端环境变量是否齐备。 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * 服务端会话客户端：Cookie 承载会话，访问受 RLS 约束。
 * 用于 `auth.getUser()` 与 `trove_record_click` 这类依赖 `auth.uid()` 的 RPC。
 */
export async function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new AppError(
      'INTERNAL',
      '缺少 Supabase 环境变量（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY）',
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component 中无法写 Cookie 时忽略；
          // 刷新逻辑在 middleware 中完成。
        }
      },
    },
  });
}
