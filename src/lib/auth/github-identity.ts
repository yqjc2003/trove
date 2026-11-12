import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GitHub 身份解析。
 *
 * trove 用 GitHub OAuth 登录时，Supabase 会把 GitHub 的资料写进
 * `auth.users.raw_user_meta_data`（实测字段）：
 *
 * ```jsonc
 * {
 *   "user_name": "yqjc2003",          // GitHub 登录名
 *   "preferred_username": "yqjc2003",
 *   "avatar_url": "https://avatars.githubusercontent.com/u/6190566?v=4",
 *   "name": "忘却回忆",
 *   "email": "…",
 *   "iss": "https://api.github.com",   // provider 标识
 *   "sub": "6190566",                  // GitHub 数字 user id
 *   "provider_id": "6190566"
 * }
 * ```
 *
 * 有了 username，客户端就能走 GitHub 的**公开端点**
 * `GET /users/{username}/starred` 读取 star 列表 —— 那个端点不需要 Token。
 * 所以本文件是「免 GITHUB_TOKEN 采集 GitHub star」这条链路的起点。
 */

/** GitHub 的 iss（provider 标识），用于判断这份 user_metadata 是不是 GitHub 给的。 */
const GITHUB_ISS = 'https://api.github.com';

export interface GithubIdentity {
  /** GitHub 登录名；非 GitHub 账号或元信息缺失时为 null */
  username: string | null;
  /** GitHub 数字 user id（provider_id / sub） */
  accountId: string | null;
  /** 头像地址 */
  avatarUrl: string | null;
}

export const EMPTY_IDENTITY: GithubIdentity = {
  username: null,
  accountId: null,
  avatarUrl: null,
};

/**
 * 从 auth 用户的元信息里抽出 GitHub 身份。**纯函数**，可离线单测。
 *
 * 只在「确实是 GitHub 登录的账号」时才认 user_name ——
 * 邮箱注册的账号 user_metadata 是空的，但为了防呆，这里仍要求 provider 是 github。
 */
export function extractGithubIdentity(input: {
  userMetadata?: Record<string, unknown> | null;
  appMetadata?: Record<string, unknown> | null;
}): GithubIdentity {
  const userMetadata = input.userMetadata ?? {};
  const appMetadata = input.appMetadata ?? {};

  const provider = typeof appMetadata.provider === 'string' ? appMetadata.provider : null;
  const iss = typeof userMetadata.iss === 'string' ? userMetadata.iss : '';
  const isGithub = provider === 'github' || iss === GITHUB_ISS || iss.startsWith(`${GITHUB_ISS}/`);
  if (!isGithub) return EMPTY_IDENTITY;

  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = userMetadata[key];
      if (typeof value === 'string' && value.trim() !== '') return value.trim();
    }
    return null;
  };

  return {
    username: pick('user_name', 'preferred_username', 'login'),
    accountId: pick('provider_id', 'sub'),
    avatarUrl: pick('avatar_url'),
  };
}

/**
 * 按 user id 读取 auth 用户的 GitHub 身份。
 *
 * 走 service-role 的 admin API（读 auth schema 不受 PostgREST 的 schema 暴露限制），
 * 且**只按传入的 user id 查** —— 调用方传的是已通过鉴权的当前用户，
 * 不存在跨用户读取的路径。
 */
export async function fetchGithubIdentity(userId: string): Promise<GithubIdentity> {
  if (!userId) return EMPTY_IDENTITY;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return EMPTY_IDENTITY;

    return extractGithubIdentity({
      userMetadata: (data.user.user_metadata ?? {}) as Record<string, unknown>,
      appMetadata: (data.user.app_metadata ?? {}) as Record<string, unknown>,
    });
  } catch {
    // 拿不到身份不该让整个账号接口失败 —— 返回「无 GitHub 身份」即可
    return EMPTY_IDENTITY;
  }
}
