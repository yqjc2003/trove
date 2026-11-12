'use client';

import { createBrowserClient } from '@supabase/ssr';

/** 浏览器端客户端：仅用 anon key，所有访问受 RLS 约束。 */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createBrowserClient(url, key);
}
