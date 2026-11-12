/**
 * 注册流程编排。
 *
 * 为什么要「应用侧自动确认」：
 *   - Supabase 托管项目默认 `mailer_autoconfirm = false`，新账号必须点确认邮件才能登录；
 *   - 免费 SMTP 每小时只有 2 封额度，实测公开 `signUp` 会直接返回 429
 *     （`over_email_send_rate_limit`），新用户根本注册不了；
 *   - 所以服务端直接用 service-role 建号并标记已确认（`admin.createUser` 不发邮件），
 *     随即换出 session，注册即登录。
 *
 * 代价：不做邮箱归属验证，任何人都能用任意邮箱注册（个人收藏工具可接受）。
 *
 * 本文件不直接依赖 Supabase 运行时，只定义最小结构接口，
 * 所以既能被 Server Action 接上真实客户端，也能被集成测试接上真实 Supabase。
 */

export interface SignUpOutcome {
  /** 已经建立会话，调用方应当跳转 */
  signedIn: boolean;
  /** 需要用户去点确认邮件（未配 service-role 时的兜底路径） */
  needsEmailConfirmation: boolean;
  /** 失败原因（人话） */
  error?: string;
}

/**
 * service-role 建号的结果：
 *   - `created`  建号成功且已标记确认
 *   - `exists`   邮箱已存在（不能覆盖）
 *   - `invalid`  输入不合法（密码太短等），直接把原因回给用户
 *   - `fallback` 没法用 service-role 建号，改走公开注册
 */
export type CreateUserOutcome =
  | { status: 'created' }
  | { status: 'exists' }
  | { status: 'invalid'; error: string }
  | { status: 'fallback' };

/** 密码下限，与 Supabase 默认策略一致。 */
export const MIN_PASSWORD_LENGTH = 6;

/** 密码强度校验：通过返回 null，否则返回人话提示。 */
export function checkPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `密码太短，至少 ${MIN_PASSWORD_LENGTH} 位。`;
  }
  return null;
}

/** auth 客户端的最小接口（@supabase/ssr 与 @supabase/supabase-js 都满足）。 */
export interface AuthClientLike {
  signUp(params: {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string };
  }): Promise<{ hasSession: boolean; userId: string | null; error: string | null }>;
  signIn(params: {
    email: string;
    password: string;
  }): Promise<{ hasSession: boolean; error: string | null; code: string | null }>;
}

/** service-role 客户端的最小接口。 */
export interface AdminClientLike {
  auth: {
    admin: {
      createUser(attrs: {
        email: string;
        password: string;
        email_confirm: boolean;
      }): Promise<{ error: { code?: string; message: string } | null }>;
      updateUserById(
        id: string,
        attrs: { email_confirm: boolean },
      ): Promise<{ error: { code?: string; message: string } | null }>;
      listUsers(opts: {
        page: number;
        perPage: number;
      }): Promise<{ data: { users: Array<{ id: string; email?: string }> } | null }>;
    };
  };
}

/** 未做类型收窄的 auth 客户端形状，用于适配真实客户端。 */
interface RawAuthClient {
  auth: {
    signUp(params: {
      email: string;
      password: string;
      options?: { emailRedirectTo?: string };
    }): Promise<{
      data: { user: { id: string } | null; session: unknown | null };
      error: { message: string } | null;
    }>;
    signInWithPassword(params: {
      email: string;
      password: string;
    }): Promise<{
      data: { session: unknown | null };
      error: { message: string; code?: string } | null;
    }>;
  };
}

/** 把真实的 Supabase auth 客户端适配成 AuthClientLike。 */
export function adaptAuthClient(client: RawAuthClient): AuthClientLike {
  return {
    signUp: async ({ email, password, options }) => {
      const { data, error } = await client.auth.signUp({ email, password, options });
      return {
        hasSession: Boolean(data.session),
        userId: data.user?.id ?? null,
        error: error ? error.message : null,
      };
    },
    signIn: async ({ email, password }) => {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      return {
        hasSession: Boolean(data.session),
        error: error ? error.message : null,
        code: error?.code ?? null,
      };
    },
  };
}

export interface SignUpDeps {
  /** 用 service-role 直接建号并标记已确认（不发确认邮件） */
  createConfirmedUser: () => Promise<CreateUserOutcome>;
  /** 按邮箱找回用户 id（用于恢复「已存在但未确认」的账号）；找不到返回 null */
  findUserIdByEmail: () => Promise<string | null>;
  /** 用 service-role 把邮箱标记为已确认；成功返回 true */
  confirmEmail: (userId: string) => Promise<boolean>;
  /** 公开注册（Supabase 侧已自动确认时直接就有会话） */
  signUp: () => Promise<{ hasSession: boolean; userId: string | null; error: string | null }>;
  /** 邮箱密码登录 */
  signIn: () => Promise<{ hasSession: boolean; error: string | null; code: string | null }>;
}

/**
 * 把真实客户端接成 SignUpDeps。
 * Server Action 与集成测试共用这份接线，避免两边行为漂移。
 */
export function buildSignUpDeps(params: {
  email: string;
  password: string;
  auth: AuthClientLike;
  admin: AdminClientLike | null;
  emailRedirectTo?: string;
}): SignUpDeps {
  const { email, password, auth, admin, emailRedirectTo } = params;
  const lower = email.trim().toLowerCase();

  return {
    createConfirmedUser: async () => {
      if (!admin) return { status: 'fallback' };
      try {
        const { error } = await admin.auth.admin.createUser({
          email: lower,
          password,
          email_confirm: true,
        });
        if (!error) return { status: 'created' };
        if (isEmailExists(error.code ?? null, error.message)) return { status: 'exists' };
        if (isValidationError(error.code ?? null, error.message)) {
          return { status: 'invalid', error: describeSignUpError(error.message) };
        }
        return { status: 'fallback' };
      } catch {
        return { status: 'fallback' };
      }
    },

    findUserIdByEmail: async () => {
      if (!admin) return null;
      try {
        const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const hit = data?.users?.find((u) => u.email?.toLowerCase() === lower);
        return hit?.id ?? null;
      } catch {
        return null;
      }
    },

    confirmEmail: async (userId: string) => {
      if (!admin) return false;
      try {
        const { error } = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
        return !error;
      } catch {
        return false;
      }
    },

    signUp: () =>
      auth.signUp({
        email: lower,
        password,
        options: emailRedirectTo ? { emailRedirectTo } : undefined,
      }),

    signIn: () => auth.signIn({ email: lower, password }),
  };
}

export async function runSignUp(deps: SignUpDeps): Promise<SignUpOutcome> {
  const created = await deps.createConfirmedUser();

  if (created.status === 'invalid') {
    return { signedIn: false, needsEmailConfirmation: false, error: created.error };
  }

  if (created.status === 'created') {
    return loginOrFail(deps, '注册成功，但自动登录失败，请用「密码登录」重试。');
  }

  if (created.status === 'exists') {
    const logged = await deps.signIn();
    if (logged.hasSession) return { signedIn: true, needsEmailConfirmation: false };

    // 密码正确但邮箱没确认（多半是上一次注册被邮件额度打断）→ 直接确认掉
    if (isEmailNotConfirmed(logged.code, logged.error)) {
      const userId = await deps.findUserIdByEmail();
      if (userId && (await deps.confirmEmail(userId))) {
        const retry = await deps.signIn();
        if (retry.hasSession) return { signedIn: true, needsEmailConfirmation: false };
      }
    }

    return {
      signedIn: false,
      needsEmailConfirmation: false,
      error: '这个邮箱已经注册过了，直接「密码登录」即可。',
    };
  }

  // —— 兜底：没配 service-role 时走公开注册 ——
  const signup = await deps.signUp();

  if (signup.error) {
    return {
      signedIn: false,
      needsEmailConfirmation: false,
      error: describeSignUpError(signup.error),
    };
  }
  if (signup.hasSession) return { signedIn: true, needsEmailConfirmation: false };

  if (signup.userId) {
    if (await deps.confirmEmail(signup.userId)) {
      return loginOrFail(deps, '注册成功，但自动登录失败，请用「密码登录」重试。');
    }
    // 确认不了就退回确认邮件流程
    return { signedIn: false, needsEmailConfirmation: true };
  }

  // 邮箱已存在且已确认：GoTrue 防枚举会返回「无用户无会话」
  const logged = await deps.signIn();
  if (logged.hasSession) return { signedIn: true, needsEmailConfirmation: false };
  return {
    signedIn: false,
    needsEmailConfirmation: false,
    error: '这个邮箱已经注册过了，直接「密码登录」即可。',
  };
}

async function loginOrFail(deps: SignUpDeps, fallbackError: string): Promise<SignUpOutcome> {
  const logged = await deps.signIn();
  if (logged.hasSession) return { signedIn: true, needsEmailConfirmation: false };
  return {
    signedIn: false,
    needsEmailConfirmation: false,
    error: logged.error ? describeSignUpError(logged.error) : fallbackError,
  };
}

/** GoTrue 报「邮箱未确认」（密码是对的，只是邮箱没验证）。 */
export function isEmailNotConfirmed(code: string | null, message: string | null): boolean {
  return /email_not_confirmed/i.test(code ?? '') || /not confirmed/i.test(message ?? '');
}

/** GoTrue 报「邮箱已注册」。 */
export function isEmailExists(code: string | null, message: string | null): boolean {
  return /email_exists|user_already_exists/i.test(code ?? '') ||
    /already been registered|already registered|has already been/i.test(message ?? '');
}

/**
 * GoTrue 报输入不合法（密码太短、邮箱格式不对等）。
 * 这类错误要直接回给用户，不能退回公开注册——那样会被邮件额度错误盖掉。
 */
export function isValidationError(code: string | null, message: string | null): boolean {
  return /weak_password|validation_failed|invalid_email|email_invalid/i.test(code ?? '') ||
    /should be at least|is invalid|not a valid/i.test(message ?? '');
}

/** 把 Supabase 的英文报错翻成人话。 */
export function describeSignUpError(raw: string): string {
  if (/over_email_send_rate_limit|email rate limit/i.test(raw)) {
    return '确认邮件的发送额度已经用尽，请稍后再试，或改用 GitHub 登录。';
  }
  if (/already registered|already been registered|user already exists|email_exists/i.test(raw)) {
    return '这个邮箱已经注册过了，直接「密码登录」即可。';
  }
  if (/email_not_confirmed|not confirmed/i.test(raw)) {
    return '这个邮箱还没完成确认，请用「密码登录」重试。';
  }
  if (/password should be at least|weak password/i.test(raw)) {
    return `密码太短，至少 ${MIN_PASSWORD_LENGTH} 位。`;
  }
  if (/email[_ ]?address[_ ]?invalid|invalid email/i.test(raw)) {
    return '邮箱地址无效，换一个试试。';
  }
  if (/rate limit|too many requests/i.test(raw)) {
    return '请求太频繁，稍后再试。';
  }
  return raw;
}
