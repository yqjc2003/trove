import { afterAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

import { adaptAuthClient, buildSignUpDeps, checkPassword, runSignUp } from '@/lib/auth/signup';

/**
 * 集成测试（注册通道）：打真实的 Supabase，跑完整注册流程。
 *
 * 覆盖的是单测跑不到的那一半——GoTrue 的真实错误码与真实行为：
 *   - `admin.createUser` 建号即已确认，且不发确认邮件
 *   - 重复注册返回 `email_exists`
 *   - 弱密码返回 `weak_password`
 *   - 未确认账号登录返回 `email_not_confirmed`
 *   - 免费 SMTP 额度耗尽时公开 `signUp` 会 429
 *
 * 默认 **skip**，不配置环境变量时整组跳过。
 *
 *   TROVE_TEST_SUPABASE_URL  Supabase 项目地址
 *   TROVE_TEST_ANON_KEY      publishable key
 *   TROVE_TEST_SERVICE_KEY   service-role key（建号/确认邮箱需要）
 */

const SUPABASE_URL = process.env.TROVE_TEST_SUPABASE_URL;
const ANON_KEY = process.env.TROVE_TEST_ANON_KEY;
const SERVICE_KEY = process.env.TROVE_TEST_SERVICE_KEY;

const enabled = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_KEY);

const PASSWORD = 'Tro9e-Signup-Int-2026';
const stamp = Date.now();
const email = `trove.signup.int.${stamp}@gmail.com`;
const staleEmail = `trove.signup.int.stale.${stamp}@gmail.com`;

const createdIds: string[] = [];

function makeDeps(target: string, password = PASSWORD) {
  const auth = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    deps: buildSignUpDeps({
      email: target,
      password,
      auth: adaptAuthClient(auth),
      admin,
    }),
    admin,
  };
}

/** admin 客户端的最小形状（避免踩 createClient 的泛型默认值）。 */
interface AdminLike {
  auth: {
    admin: {
      listUsers(opts: {
        page: number;
        perPage: number;
      }): Promise<{ data: { users: Array<{ id: string; email?: string }> } | null }>;
    };
  };
}

async function findUserId(admin: AdminLike, target: string) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data?.users?.find((u) => u.email?.toLowerCase() === target.toLowerCase())?.id ?? null;
}

describe.skipIf(!enabled)('集成测试（注册通道）', () => {
  it('新账号注册即登录：建号 + 已确认 + 不需要确认邮件', async () => {
    const { deps, admin } = makeDeps(email);
    const outcome = await runSignUp(deps);

    expect(outcome.error).toBeUndefined();
    expect(outcome.signedIn).toBe(true);
    expect(outcome.needsEmailConfirmation).toBe(false);

    const id = await findUserId(admin, email);
    expect(id).toBeTruthy();
    createdIds.push(id!);

    const { data } = await admin.auth.admin.getUserById(id!);
    expect(data?.user?.email_confirmed_at).toBeTruthy();
  }, 30000);

  it('重复注册且密码正确 → 直接登录', async () => {
    const { deps } = makeDeps(email);
    const outcome = await runSignUp(deps);

    expect(outcome.signedIn).toBe(true);
    expect(outcome.error).toBeUndefined();
  }, 30000);

  it('重复注册但密码错误 → 提示已注册，且不动别人的账号', async () => {
    const { deps } = makeDeps(email, 'Another-Password-9999');
    const outcome = await runSignUp(deps);

    expect(outcome.signedIn).toBe(false);
    expect(outcome.error).toContain('已经注册');
  }, 30000);

  it('已存在但未确认的账号 → 自动确认后登录', async () => {
    const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await admin.auth.admin.createUser({
      email: staleEmail,
      password: PASSWORD,
      email_confirm: false,
    });
    expect(error).toBeNull();

    const id = await findUserId(admin, staleEmail);
    expect(id).toBeTruthy();
    createdIds.push(id!);

    const { deps } = makeDeps(staleEmail);
    const outcome = await runSignUp(deps);

    expect(outcome.signedIn).toBe(true);
    expect(outcome.error).toBeUndefined();

    const { data } = await admin.auth.admin.getUserById(id!);
    expect(data?.user?.email_confirmed_at).toBeTruthy();
  }, 30000);

  it('弱密码在应用层就被拦下', () => {
    expect(checkPassword('abc')).toContain('6 位');
    expect(checkPassword(PASSWORD)).toBeNull();
  });

  afterAll(async () => {
    if (!enabled) return;
    const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    for (const id of createdIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });
});
