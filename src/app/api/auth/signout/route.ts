import { NextResponse } from 'next/server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

/** POST /api/auth/signout —— 退出登录并回到登录页。 */
export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  } catch {
    // 即使注销失败也回到登录页
  }

  return NextResponse.redirect(new URL('/login', req.url), { status: 303 });
}
