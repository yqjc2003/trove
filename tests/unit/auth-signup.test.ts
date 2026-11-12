import { describe, expect, it, vi } from 'vitest';

import {
  checkPassword,
  describeSignUpError,
  isEmailExists,
  isEmailNotConfirmed,
  isValidationError,
  MIN_PASSWORD_LENGTH,
  runSignUp,
} from '@/lib/auth/signup';

describe('runSignUp —— service-role 建号（主路径）', () => {
  it('建号成功 → 换出会话即登录', async () => {
    const signIn = vi.fn(async () => ({ hasSession: true, error: null, code: null }));

    const outcome = await runSignUp({
      createConfirmedUser: async () => ({ status: 'created' }),
      findUserIdByEmail: vi.fn(),
      confirmEmail: vi.fn(),
      signUp: vi.fn(),
      signIn,
    });

    expect(outcome).toEqual({ signedIn: true, needsEmailConfirmation: false });
    expect(signIn).toHaveBeenCalledOnce();
  });

  it('建号成功但登录失败 → 报错而不是假装成功', async () => {
    const outcome = await runSignUp({
      createConfirmedUser: async () => ({ status: 'created' }),
      findUserIdByEmail: vi.fn(),
      confirmEmail: vi.fn(),
      signUp: vi.fn(),
      signIn: async () => ({ hasSession: false, error: 'Invalid login credentials', code: null }),
    });

    expect(outcome.signedIn).toBe(false);
    expect(outcome.error).toBeTruthy();
  });

  it('输入不合法 → 直接回原因，不退回公开注册', async () => {
    const signUp = vi.fn();

    const outcome = await runSignUp({
      createConfirmedUser: async () => ({ status: 'invalid', error: '密码太短，至少 6 位。' }),
      findUserIdByEmail: vi.fn(),
      confirmEmail: vi.fn(),
      signUp,
      signIn: vi.fn(),
    });

    expect(outcome).toEqual({
      signedIn: false,
      needsEmailConfirmation: false,
      error: '密码太短，至少 6 位。',
    });
    expect(signUp).not.toHaveBeenCalled();
  });

  it('邮箱已存在且密码正确 → 直接登录', async () => {
    const findUserIdByEmail = vi.fn();
    const confirmEmail = vi.fn();

    const outcome = await runSignUp({
      createConfirmedUser: async () => ({ status: 'exists' }),
      findUserIdByEmail,
      confirmEmail,
      signUp: vi.fn(),
      signIn: async () => ({ hasSession: true, error: null, code: null }),
    });

    expect(outcome).toEqual({ signedIn: true, needsEmailConfirmation: false });
    expect(findUserIdByEmail).not.toHaveBeenCalled();
    expect(confirmEmail).not.toHaveBeenCalled();
  });

  it('邮箱已存在且密码正确但邮箱没确认 → 找回 id 确认后再登录', async () => {
    const findUserIdByEmail = vi.fn(async () => 'u-42');
    const confirmEmail = vi.fn(async () => true);
    const signIn = vi
      .fn()
      .mockResolvedValueOnce({
        hasSession: false,
        error: 'Email not confirmed',
        code: 'email_not_confirmed',
      })
      .mockResolvedValueOnce({ hasSession: true, error: null, code: null });

    const outcome = await runSignUp({
      createConfirmedUser: async () => ({ status: 'exists' }),
      findUserIdByEmail,
      confirmEmail,
      signUp: vi.fn(),
      signIn,
    });

    expect(findUserIdByEmail).toHaveBeenCalledOnce();
    expect(confirmEmail).toHaveBeenCalledWith('u-42');
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(outcome).toEqual({ signedIn: true, needsEmailConfirmation: false });
  });

  it('邮箱已存在且密码不对 → 提示已注册，不去动别人的账号', async () => {
    const findUserIdByEmail = vi.fn();
    const confirmEmail = vi.fn();

    const outcome = await runSignUp({
      createConfirmedUser: async () => ({ status: 'exists' }),
      findUserIdByEmail,
      confirmEmail,
      signUp: vi.fn(),
      signIn: async () => ({ hasSession: false, error: 'Invalid login credentials', code: null }),
    });

    expect(outcome.signedIn).toBe(false);
    expect(outcome.error).toContain('已经注册');
    expect(findUserIdByEmail).not.toHaveBeenCalled();
    expect(confirmEmail).not.toHaveBeenCalled();
  });
});

describe('runSignUp —— 兜底路径（没有 service-role）', () => {
  it('公开注册直接带会话 → 登录', async () => {
    const outcome = await runSignUp({
      createConfirmedUser: async () => ({ status: 'fallback' }),
      findUserIdByEmail: vi.fn(),
      confirmEmail: vi.fn(),
      signUp: async () => ({ hasSession: true, userId: 'u1', error: null }),
      signIn: vi.fn(),
    });

    expect(outcome).toEqual({ signedIn: true, needsEmailConfirmation: false });
  });

  it('公开注册报错 → 翻译成中文并终止', async () => {
    const signIn = vi.fn();

    const outcome = await runSignUp({
      createConfirmedUser: async () => ({ status: 'fallback' }),
      findUserIdByEmail: vi.fn(),
      confirmEmail: vi.fn(),
      signUp: async () => ({ hasSession: false, userId: null, error: 'email rate limit exceeded' }),
      signIn,
    });

    expect(outcome.error).toContain('额度');
    expect(signIn).not.toHaveBeenCalled();
  });

  it('公开注册待确认 → 服务端确认后换出会话', async () => {
    const outcome = await runSignUp({
      createConfirmedUser: async () => ({ status: 'fallback' }),
      findUserIdByEmail: vi.fn(),
      confirmEmail: vi.fn(async () => true),
      signUp: async () => ({ hasSession: false, userId: 'u1', error: null }),
      signIn: async () => ({ hasSession: true, error: null, code: null }),
    });

    expect(outcome).toEqual({ signedIn: true, needsEmailConfirmation: false });
  });

  it('公开注册待确认且确认不了 → 退回确认邮件流程', async () => {
    const outcome = await runSignUp({
      createConfirmedUser: async () => ({ status: 'fallback' }),
      findUserIdByEmail: vi.fn(),
      confirmEmail: vi.fn(async () => false),
      signUp: async () => ({ hasSession: false, userId: 'u1', error: null }),
      signIn: vi.fn(),
    });

    expect(outcome).toEqual({ signedIn: false, needsEmailConfirmation: true });
  });

  it('公开注册返回空（邮箱已存在）→ 密码正确则登录', async () => {
    const outcome = await runSignUp({
      createConfirmedUser: async () => ({ status: 'fallback' }),
      findUserIdByEmail: vi.fn(),
      confirmEmail: vi.fn(),
      signUp: async () => ({ hasSession: false, userId: null, error: null }),
      signIn: async () => ({ hasSession: true, error: null, code: null }),
    });

    expect(outcome).toEqual({ signedIn: true, needsEmailConfirmation: false });
  });
});

describe('密码强度', () => {
  it('少于下限 → 给出提示', () => {
    expect(checkPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toContain('6 位');
  });

  it('达到下限 → 通过', () => {
    expect(checkPassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });
});

describe('错误识别', () => {
  it('email_not_confirmed', () => {
    expect(isEmailNotConfirmed('email_not_confirmed', null)).toBe(true);
    expect(isEmailNotConfirmed(null, 'Email not confirmed')).toBe(true);
    expect(isEmailNotConfirmed(null, 'Invalid login credentials')).toBe(false);
  });

  it('email_exists', () => {
    expect(isEmailExists('email_exists', null)).toBe(true);
    expect(isEmailExists(null, 'A user with this email address has already been registered')).toBe(
      true,
    );
    expect(isEmailExists(null, 'boom')).toBe(false);
  });

  it('validation_failed', () => {
    expect(isValidationError('weak_password', null)).toBe(true);
    expect(isValidationError('validation_failed', null)).toBe(true);
    expect(isValidationError(null, 'Password should be at least 6 characters.')).toBe(true);
    expect(isValidationError('email_exists', null)).toBe(false);
    expect(isValidationError(null, 'boom')).toBe(false);
  });
});

describe('describeSignUpError', () => {
  it('邮件额度用尽 → 给出替代路径', () => {
    expect(describeSignUpError('email rate limit exceeded')).toContain('额度');
  });

  it('已注册 → 引导去登录', () => {
    expect(describeSignUpError('User already registered')).toContain('已经注册');
  });

  it('弱密码 → 提示最短长度', () => {
    expect(describeSignUpError('Password should be at least 6 characters.')).toContain('6 位');
  });

  it('邮箱非法 → 提示换邮箱', () => {
    expect(describeSignUpError('email_address_invalid')).toContain('邮箱地址无效');
  });

  it('频率限制 → 提示稍后再试', () => {
    expect(describeSignUpError('Too many requests')).toContain('频繁');
  });

  it('未知错误原样透出', () => {
    expect(describeSignUpError('boom')).toBe('boom');
  });
});
