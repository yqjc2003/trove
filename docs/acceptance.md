# 手工验收清单

自动化测试覆盖的是纯逻辑（URL 规范化、标签、upsert 字段矩阵、权限解析…）。
以下清单需要**真实 Supabase 项目**才能跑，请在部署后逐条走一遍。

前置：`.env.local` 已填好 Supabase 凭据，`db/migrations/0001_init.sql` 已应用，
Vercel 生产环境变量已配置。

---

## 账号与空间

1. **注册/登录** —— 邮箱注册 → 自动建 `profiles`（**不预置任何标签**）→ 登出 → 登录成功。
2. **GitHub 登录** —— 点「使用 GitHub 登录」→ 回调后进入概览页。

## 收藏与 Upsert

3. **重复录入 = Upsert** —— 对同一 URL 连续录入两次 → `items` 只有 1 条；
   第二次响应 `created=false`；`created_at` 不变、`updated_at` 刷新；
   `collected_at` / 归档状态 / `read_at` / `click_count` 均不变。
4. **Upsert 局部更新** —— 再次录入只带 `title`（不带 `tags` / `summary`）→
   原标签与原摘要保留，标题被覆盖；带 `tags` → 标签整体替换；带 `notes` → 笔记**追加**而非覆盖。
5. **规范化去重** —— `https://x.com/a?utm_source=t`、`https://www.x.com/a`、
   `https://x.com/a#frag` 三者命中同一条。
6. **标签上限按通道分层** —— API Key 通道（REST / MCP / Skill）写 4 个标签 →
   `422 MAX_TAGS_EXCEEDED`；直接 SQL 插入第 4 个 → 触发器拒绝；
   且拒绝后 **item 未被创建/修改、原标签集合不变**。
   会话通道（Web）写 4 个以上标签 → **允许**，不触发上述拒绝。

## 标签（分类即标签）

7. **AI 标签原样入库** —— 用 Skill 录入一条链接，Agent 给出 3 个自定义标签
   （如「数据库」「向量检索」「2026-Q1」）→ `tags` 表出现这 3 个（`origin='agent'`），
   无任何预置分类混入。
8. **用户 DIY 标签** —— 在 `/settings` 新建标签「读书」→ 出现在标签列表；
   给某条收藏加这个标签 → 生效；在 `/items` 按「读书」筛选 → 只出该收藏。
9. **标签改名** —— 把「读书」改名为「阅读」→ 所有绑定 item 的显示同步变化，
   绑定关系与数量不变。
10. **标签删除** —— 删除「阅读」→ 提示影响 N 条；确认后相关 item 的该标签消失，
    item 本身不受影响。
11. **标签隔离** —— 用户 B 看不到用户 A 的任何标签（列表、筛选、item 详情均不可见）；
    B 的 Key 访问 A 的 item id → 404。

## 点击追踪与提醒

12. **点击追踪** —— Web 点「打开链接」→ 302 跳到目标站点；`click_events` 新增一行、
    `click_count=1`、`read_at` 非空；再点 → `click_count=2`、`read_at` 不变。
13. **超期提醒** —— 手工把某条 `collected_at` 改成 20 天前且 `read_at=null` →
    出现在 `/reminders` 与仪表盘提醒区；点击它后消失。
14. **归档** —— 归档 → 默认列表与提醒不再出现 → `/archive` 可见 → 取消归档后恢复，
    `collected_at` 不变。

## 检索与笔记

15. **检索** —— 按域名、标签、内容形态、关键词各筛一次 → 结果集正确；
    URL 含 `?utm_source=` 的条目能被 `q` 命中。
16. **笔记** —— 写含代码块与列表的 Markdown → 保存 → 预览正确渲染；编辑与删除生效。

## Web 手工通道

17. **手工添加** —— 列表页点「新增收藏」→ 填链接 / 标题 / 摘要 / 标签 → 保存 →
    跳到详情页；条目归属正确用户、`source='manual'`、内容形态按域名自动识别。
18. **标签不限数量** —— 在详情页把某条收藏的标签改成 5 个 → 生效、不报错；
    同一账号用 REST（API Key）给这条写 4 个标签 → `422 MAX_TAGS_EXCEEDED`。

## MCP 与 Skill

19. **MCP** —— 用 `trv_` Key 直连 `/api/mcp`，`trove_save` → 条目归属正确用户；
    重复 `trove_save` 同一 URL → `created=false` 且不新增；
    `trove_manage_tag` 新建/改名/删除标签均生效；无 Key → 401 + `WWW-Authenticate` 挑战。
20. **Skill** —— `bookmarks` 模式导入 Chrome 书签 ≥10 条（标题/摘要/≤3 标签齐全）；
    `github-stars` 模式导入 star ≥5 条；`url` 模式单条/多条均可。
21. **GitHub star 免 Token** —— `GET /api/trove/account` 返回 `github_username`；
    **不配 `GITHUB_TOKEN`、不传 `--user`**，只靠 `TROVE_API_KEY` 跑
    `node github-stars.mjs --limit 5` → 输出 `mode="public-user"`、
    `username_source="trove-account"`、拿到 ≥1 条 star。
22. **部署** —— Vercel 生产环境走一遍 1–21（API base 与 MCP url 指向生产域名）。

---

## 自动化门禁

### 收集流 / 回看台 UI（DESIGN.md）

1. 首页一次呈现一条候选；切换主题、形态及随机一条均符合当前候选集。
2. 「稍后再看」仅跳过本轮，刷新后重新出现，收藏时间与未读状态不变。
3. 归档成功后移出队列、可撤销；错误时保留条目并显示错误。
4. 回看台、收集流与藏库点击标题使用新标签页与 `/r/[id]` 302 跳转；不预取跳转地址；「详情与笔记」才进入站内详情。返回后刷新状态，能进入对应笔记落点。
5. 收集流按首次收藏日期倒序分组；来源与来源记录准确，分页可回退。
6. 藏库组合搜索、标签 AND、域名、来源与形态；浏览器前进/后退同步搜索输入及条件；逐项移除与清空镜头可用。
7. 待回看镜头遵守个人阈值并排除归档；常打开按点击数排序，旧 `/archive` 进入归档镜头。
8. 详情单列呈现完整摘要与笔记，「整理收藏」默认折叠；没有「直接访问（不记录）」入口；保存有反馈、失败保留草稿。
9. 词汇表标签可点入藏库，改名显示影响范围，删除只解除绑定。
10. 在 390px 与 1440px 下逐页检查回看台、收集流、藏库、详情、我的语言、登录与手工新增；页面不横向溢出，键盘焦点可见，触控区可点。
11. 字体采用比例宽度的系统无衬线，代码与密钥保持等宽，页面不再请求 Sarasa 字体 CDN。
12. Skill/MCP 用 HashMap 与 ArrayList 源码文章试采集，应优先共享 `java`、`源码阅读` 等较宽标签；不为类名/方法名另建标签，不自动改动旧标签。

每次提交前：

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
