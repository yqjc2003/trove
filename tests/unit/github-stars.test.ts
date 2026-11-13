import { describe, expect, it } from 'vitest';

import { extractGithubIdentity, EMPTY_IDENTITY } from '@/lib/auth/github-identity';
import {
  parseArgs,
  selectEndpoint,
  normalizeStarEntry,
  buildHeaders,
} from '../../skills/catchlinger-capture/scripts/github-stars.mjs';

/**
 * 「只要知道 GitHub 用户名就能读 star 列表」这条链路的两端：
 *
 *   服务端：从 auth.users 的 OAuth 元信息里取出 GitHub 用户名
 *   Skill 端：拿到用户名后走公开端点 /users/{username}/starred（无需 Token）
 *
 * 两端都必须离线可测。
 */

/** 实测 trove 生产库里 GitHub OAuth 用户的 user_metadata 形状。 */
const GITHUB_METADATA = {
  avatar_url: 'https://avatars.githubusercontent.com/u/6190566?v=4',
  email: 'yqjc2003@gmail.com',
  email_verified: true,
  full_name: '忘却回忆',
  iss: 'https://api.github.com',
  name: '忘却回忆',
  phone_verified: false,
  preferred_username: 'yqjc2003',
  provider_id: '6190566',
  sub: '6190566',
  user_name: 'yqjc2003',
};

describe('GitHub 身份解析', () => {
  it('从 OAuth 元信息里取出 username / accountId / 头像', () => {
    const id = extractGithubIdentity({
      userMetadata: GITHUB_METADATA,
      appMetadata: { provider: 'github', providers: ['github'] },
    });
    expect(id.username).toBe('yqjc2003');
    expect(id.accountId).toBe('6190566');
    expect(id.avatarUrl).toBe('https://avatars.githubusercontent.com/u/6190566?v=4');
  });

  it('provider 是 github 时也认（不依赖 iss）', () => {
    const id = extractGithubIdentity({
      userMetadata: { user_name: 'someone' },
      appMetadata: { provider: 'github' },
    });
    expect(id.username).toBe('someone');
  });

  it('邮箱注册账号（无 GitHub 身份）返回空', () => {
    expect(extractGithubIdentity({ userMetadata: {}, appMetadata: { provider: 'email' } })).toEqual(
      EMPTY_IDENTITY,
    );
    expect(extractGithubIdentity({})).toEqual(EMPTY_IDENTITY);
  });

  it('缺 provider 且 iss 不指向 GitHub 时不误认', () => {
    const id = extractGithubIdentity({
      userMetadata: { user_name: 'not-github', iss: 'https://example.com' },
      appMetadata: { provider: 'email' },
    });
    expect(id.username).toBeNull();
  });

  it('user_name 缺失时回落到 preferred_username / login', () => {
    expect(
      extractGithubIdentity({
        userMetadata: { preferred_username: 'via-preferred' },
        appMetadata: { provider: 'github' },
      }).username,
    ).toBe('via-preferred');
    expect(
      extractGithubIdentity({
        userMetadata: { login: 'via-login' },
        appMetadata: { provider: 'github' },
      }).username,
    ).toBe('via-login');
  });

  it('空白字符串不算有效用户名', () => {
    expect(
      extractGithubIdentity({
        userMetadata: { user_name: '   ' },
        appMetadata: { provider: 'github' },
      }).username,
    ).toBeNull();
  });
});

describe('star 端点选择', () => {
  it('有用户名 → 公开端点，不需要 Token', () => {
    const ep = selectEndpoint({ user: 'yqjc2003', hasToken: false });
    expect(ep).toMatchObject({
      mode: 'public-user',
      path: '/users/yqjc2003/starred',
      useAuthEndpoint: false,
    });
  });

  it('没有用户名但有 Token → 认证端点', () => {
    const ep = selectEndpoint({ user: null, hasToken: true });
    expect(ep).toMatchObject({ mode: 'authenticated-user', path: '/user/starred' });
  });

  it('两者都没有 → 报错', () => {
    expect(selectEndpoint({ user: null, hasToken: false })).toEqual({ error: 'NO_ENDPOINT' });
  });

  it('用户名走 URL 编码（防注入）', () => {
    expect(selectEndpoint({ user: 'a/b?c', hasToken: false })).toMatchObject({
      path: '/users/a%2Fb%3Fc/starred',
    });
  });

  it('空白用户名视为没给', () => {
    expect(selectEndpoint({ user: '   ', hasToken: true })).toMatchObject({
      mode: 'authenticated-user',
    });
  });
});

describe('star 条目归一', () => {
  it('吃得下 star+json 媒体类型的 {starred_at, repo} 包装', () => {
    const entry = normalizeStarEntry({
      starred_at: '2026-11-11T08:06:09Z',
      repo: {
        full_name: 'wheresryan22/anatomy',
        html_url: 'https://github.com/wheresryan22/anatomy',
        description: 'desc',
        topics: ['agent-skill'],
        language: 'JavaScript',
        stargazers_count: 26821,
      },
    });
    expect(entry).toMatchObject({
      full_name: 'wheresryan22/anatomy',
      html_url: 'https://github.com/wheresryan22/anatomy',
      starred_at: '2026-11-11T08:06:09Z',
      stargazers_count: 26821,
    });
  });

  it('也吃得下裸 Repository（字段在顶层）', () => {
    const entry = normalizeStarEntry({
      full_name: 'a/b',
      html_url: 'https://github.com/a/b',
      topics: [],
    });
    expect(entry).toMatchObject({ full_name: 'a/b', topics: [], starred_at: null });
  });

  it('缺少 full_name 的条目被丢弃', () => {
    expect(normalizeStarEntry({ description: 'no name' })).toBeNull();
    expect(normalizeStarEntry(null)).toBeNull();
  });
});

describe('请求头', () => {
  it('有 Token 才带 authorization', () => {
    expect(buildHeaders('').authorization).toBeUndefined();
    expect(buildHeaders('ghp_x').authorization).toBe('Bearer ghp_x');
  });

  it('用 star+json 媒体类型才能拿到 starred_at', () => {
    expect(buildHeaders('').accept).toBe('application/vnd.github.star+json');
  });
});

describe('命令行解析', () => {
  it('解析 --limit 与 --user', () => {
    const args = parseArgs(['--limit', '50', '--user', 'yqjc2003']);
    expect(args.limit).toBe(50);
    expect(args.user).toBe('yqjc2003');
  });

  it('缺省 limit 为不限', () => {
    expect(parseArgs([]).limit).toBe(Infinity);
    expect(parseArgs([]).user).toBeNull();
  });
});
