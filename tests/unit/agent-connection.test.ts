import { describe, expect, it } from 'vitest';

import { DEFAULT_AGENT_API_BASE, resolveAgentApiBase } from '@/lib/agent-connection';

describe('Agent 连接地址', () => {
  it('未配置时使用可从外部 Agent 访问的正式域名', () => {
    expect(resolveAgentApiBase('')).toBe(DEFAULT_AGENT_API_BASE);
  });

  it('允许本地联调时显式覆盖，并去掉结尾斜杠', () => {
    expect(resolveAgentApiBase('http://localhost:3000/api/trove/')).toBe(
      'http://localhost:3000/api/trove',
    );
  });
});
