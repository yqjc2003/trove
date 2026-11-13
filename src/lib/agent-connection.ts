/**
 * 交给外部 Agent 的 API Base 必须是可从其运行环境访问的公开地址。
 * 开发页面的 localhost 不能作为默认值；本地联调时再显式用环境变量覆盖。
 */
export const DEFAULT_AGENT_API_BASE = 'https://catchlinger.sxyicheng.tech/api/trove';

export function resolveAgentApiBase(value = process.env.CATCHLINGER_AGENT_API_BASE): string {
  const trimmed = value?.trim().replace(/\/+$/, '');
  return trimmed || DEFAULT_AGENT_API_BASE;
}
