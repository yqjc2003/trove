'use server';

import { headers } from 'next/headers';

import {
  adaptAuthClient,
  buildSignUpDeps,
  checkPassword,
  runSignUp,
  type SignUpOutcome,
} from '@/lib/auth/signup';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * 邮箱注册（Server Action）。
 *
 * 走服务端而不是浏览器端：建号并标记邮箱已确认必须用 service-role，
 * 该 key 绝不能出现在前端代码或 NEXT_PUBLIC_* 变量里。
 *
 * 用 `admin.createUser` 而不是公开 `signUp`：前者不发确认邮件，
 * 不受 Supabase 免费 SMTP（每小时 2 封）的限制。
 */
export async function signUpAction(
  email: string,
  password: string,
  next: string,
): Promise<SignUpOutcome> {
  const trimmed = email.trim();
  if (!trimmed || !password) {
    return { signedIn: false, needsEmailConfirmation: false, error: '请填写邮箱和密码。' };
  }

  const pwError = checkPassword(password);
  if (pwError) {
    return { signedIn: false, needsEmailConfirmation: false, error: pwError };
  }

  const supabase = await createServerSupabaseClient();
  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : null;
  const emailRedirectTo = `${await resolveSiteUrl()}/auth/callback?next=${encodeURIComponent(
    safeNext(next),
  )}`;

  return runSignUp(
    buildSignUpDeps({
      email: trimmed,
      password,
      auth: adaptAuthClient(supabase),
      admin,
      emailRedirectTo,
    }),
  );
}

/** 站点根地址：优先 NEXT_PUBLIC_SITE_URL，其次请求 Origin。 */
async function resolveSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return stripTrailingSlash(configured);

  const h = await headers();
  return stripTrailingSlash(h.get('origin') ?? 'http://localhost:3000');
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** 只允许站内相对路径，防止开放重定向。 */
function safeNext(raw: string): string {
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
}
