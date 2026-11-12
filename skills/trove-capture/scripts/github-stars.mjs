#!/usr/bin/env node
/**
 * github-stars.mjs — 读取当前用户的 GitHub star 列表。
 *
 * 用法：node github-stars.mjs [--limit N]
 *
 * 零依赖。需要 GITHUB_TOKEN（否则匿名调用受 60 次/小时的限流）。
 * 401 会明确提示配置 token。
 */

const API = 'https://api.github.com';
const PER_PAGE = 100;
const MAX_PAGES = 50; // 上限 5000 条

function parseArgs(argv) {
  const args = { limit: Infinity };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--limit') args.limit = Number(argv[++i] ?? '0') || Infinity;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'TroveCapture/1.0',
};

if (process.env.GITHUB_TOKEN) {
  headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

const stars = [];
let page = 1;
let rateLimited = false;
let authFailed = false;

while (page <= MAX_PAGES && stars.length < args.limit) {
  const url = `${API}/user/starred?per_page=${PER_PAGE}&page=${page}`;

  let res;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    console.error(
      JSON.stringify(
        { error: `请求 GitHub API 失败：${e?.message ?? e}`, stars: [] },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  if (res.status === 401) {
    authFailed = true;
    break;
  }

  if (res.status === 403) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    rateLimited = remaining === '0';
    break;
  }

  if (!res.ok) {
    console.error(
      JSON.stringify(
        { error: `GitHub API 返回 ${res.status} ${res.statusText}`, stars: [] },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const batch = await res.json();
  if (!Array.isArray(batch) || batch.length === 0) break;

  for (const s of batch) {
    stars.push({
      full_name: s.full_name,
      html_url: s.html_url,
      description: s.description ?? null,
      topics: Array.isArray(s.topics) ? s.topics : [],
      language: s.language ?? null,
      stargazers_count: s.stargazers_count ?? 0,
      starred_at: s.starred_at ?? null,
    });
  }

  if (batch.length < PER_PAGE) break;
  page += 1;
}

const limited = stars.slice(0, args.limit);

if (authFailed) {
  console.error(
    JSON.stringify(
      {
        error:
          'GitHub 认证失败（401）。请设置 GITHUB_TOKEN 环境变量后重试；匿名调用无法读取 star 列表。',
        stars: [],
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

if (rateLimited) {
  console.error(
    JSON.stringify(
      {
        error:
          'GitHub API 限流（403）。请设置 GITHUB_TOKEN 环境变量（认证后配额为 5000 次/小时）。',
        stars: [],
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify({ count: limited.length, stars: limited }, null, 2),
);
