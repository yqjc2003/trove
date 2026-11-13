import { describe, expect, it } from 'vitest';

import { buildAgentInstallPrompt } from '@/lib/agent-install-prompt';

describe('Agent 安装提示', () => {
  it('只通过 Release 资产安装 Skill，不要求 clone 应用仓库', () => {
    const prompt = buildAgentInstallPrompt({
      apiBase: 'https://catchlinger.example/api/trove',
      apiKey: 'trv_example',
    });
    expect(prompt).toContain('releases/latest/download/catchlinger-capture.zip');
    expect(prompt).toContain('install-catchlinger-skill.ps1');
    expect(prompt).not.toContain('git clone');
    expect(prompt).toContain('CATCHLINGER_API_BASE=https://catchlinger.example/api/trove');
    expect(prompt).toContain('CATCHLINGER_API_KEY=trv_example');
  });
});
