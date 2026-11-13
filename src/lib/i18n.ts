export const locales = ['en-US', 'zh-CN', 'zh-TW'] as const;
export type Locale = (typeof locales)[number];
export const DEFAULT_LOCALE: Locale = 'zh-CN';
export const LOCALE_COOKIE = 'trove_locale';

export function isLocale(value: string | undefined | null): value is Locale {
  return Boolean(value && locales.includes(value as Locale));
}

/** Picks a supported locale without depending on a third-party negotiation package. */
export function localeFromAcceptLanguage(value: string | null): Locale {
  const languages = (value ?? '')
    .toLowerCase()
    .split(',')
    .map((part) => part.trim().split(';')[0]);
  if (languages.some((language) => language === 'zh-tw' || language === 'zh-hk' || language === 'zh-mo')) return 'zh-TW';
  if (languages.some((language) => language.startsWith('zh'))) return 'zh-CN';
  if (languages.some((language) => language.startsWith('en'))) return 'en-US';
  return DEFAULT_LOCALE;
}

type Variables = Record<string, string | number>;

const messages: Record<Locale, Record<string, string>> = {
  'en-US': {
    'brand': 'CatchLinger', 'nav.dashboard': 'Review', 'nav.stream': 'Stream', 'nav.library': 'Library', 'nav.settings': 'Settings', 'nav.capture': 'Save a link', 'nav.signOut': 'Sign out',
    'locale.label': 'Language', 'locale.en-US': 'English (US)', 'locale.zh-CN': '简体中文', 'locale.zh-TW': '繁體中文',
    'common.save': 'Save', 'common.cancel': 'Cancel', 'common.delete': 'Delete', 'common.edit': 'Edit', 'common.loading': 'Loading…', 'common.backToLibrary': 'Back to library',
    'landing.login': 'Sign in', 'landing.start': 'Start with your first link', 'landing.how': 'How it works',
    'login.title': 'CatchLinger', 'login.lead': 'Gather scattered links, then reopen what matters.',
    'dashboard.title': 'Today, revisit one thing.', 'dashboard.subtitle': 'Good things you saved deserve another opening.', 'dashboard.unread': 'View unread saves', 'dashboard.library': 'Your library', 'dashboard.total': 'Saved', 'dashboard.unreadCount': 'Unread', 'dashboard.overdue': 'To revisit', 'dashboard.week': 'Added this week',
    'items.title': 'Library', 'items.subtitle': 'Everything you once found worth keeping, in one place.', 'items.capture': 'Save a link', 'items.results': '{{count}} saved items found', 'items.empty': 'No matching saves', 'items.emptyText': 'Try another keyword or clear your filters.', 'items.clear': 'Clear filters', 'items.manual': 'Save a link manually', 'items.previous': 'Previous', 'items.next': 'Next',
    'newItem.title': 'Save a link', 'newItem.subtitle': 'Add a link manually. Its content type is recognized from the domain; tags are unlimited.',
    'stream.title': 'Collection stream', 'stream.subtitle': 'Links you saved from everywhere, gathered here.', 'stream.emptyTitle': 'Your first link starts here', 'stream.emptyText': 'Save a link manually, or connect an Agent to import browser bookmarks and GitHub Stars.', 'stream.connectAgent': 'Connect an Agent', 'stream.pageItems': '{{count}} on this page', 'stream.totalItems': '{{count}} saved items', 'stream.newer': 'Newer saves', 'stream.older': 'Older saves', 'stream.origins': 'Where your saves come from', 'stream.originsText': 'Entries are grouped by when they were first saved. Re-importing enriches an existing save while keeping its original place.', 'stream.reportText': 'Date groups show your saved items. See your Agent collection report for each import’s new, updated, and failed results.', 'stream.manageConnections': 'Manage collection connections', 'stream.sourceRecord': 'Source record: {{source}}',
    'item.openNewTab': '(opens original in a new tab)', 'item.savedOn': 'Saved {{date}}', 'item.opened': 'Opened {{count}} times', 'item.unread': 'Unread', 'item.read': 'Read', 'item.archived': 'Archived', 'item.details': 'Details & notes', 'item.detailsAria': 'View details: {{title}}',
    'form.url': 'Link', 'form.title': 'Title', 'form.summary': 'Summary', 'form.tags': 'Tags', 'form.urlPlaceholder': 'https://example.com/article', 'form.titlePlaceholder': 'For example: an article to read later…', 'form.summaryPlaceholder': 'A short note; optional…', 'form.tagsUnlimited': 'When organizing manually, there is no tag limit.', 'form.saving': 'Saving…',
    'settings.title': 'Settings', 'settings.subtitle': 'Build a personal vocabulary for the things you keep.', 'settings.language': 'Display language', 'settings.languageHelp': 'Choose the language used throughout the web interface.',
    'format.today': 'Today', 'format.yesterday': 'Yesterday', 'format.daysAgo': '{{count}} days ago', 'format.monthsAgo': '{{count}} months ago', 'format.yearsAgo': '{{count}} years ago',
    'labels.article': 'Article', 'labels.video': 'Video', 'labels.repo': 'Repository', 'labels.tool': 'Tool', 'labels.social': 'Social', 'labels.doc': 'Document', 'labels.other': 'Other',
    'labels.manual': 'Manual', 'labels.skill': 'Agent Skill', 'labels.mcp': 'MCP', 'labels.github': 'GitHub Star', 'labels.bookmark': 'Browser bookmark',
  },
  'zh-CN': {
    'brand': '拾藏', 'nav.dashboard': '回看台', 'nav.stream': '收集流', 'nav.library': '藏库', 'nav.settings': '设置', 'nav.capture': '收一条链接', 'nav.signOut': '退出',
    'locale.label': '界面语言', 'locale.en-US': 'English (US)', 'locale.zh-CN': '简体中文', 'locale.zh-TW': '繁體中文',
    'common.save': '保存', 'common.cancel': '取消', 'common.delete': '删除', 'common.edit': '编辑', 'common.loading': '加载中…', 'common.backToLibrary': '返回藏库',
    'landing.login': '已有账号，登录', 'landing.start': '从第一条开始', 'landing.how': '看看怎么用',
    'login.title': '拾藏', 'login.lead': '把散落的链接收进来，再把真正重要的打开。',
    'dashboard.title': '今天，先回收一条。', 'dashboard.subtitle': '曾经收下的好东西，值得再打开一次。', 'dashboard.unread': '查看未读收藏', 'dashboard.library': '你的藏库', 'dashboard.total': '收藏', 'dashboard.unreadCount': '未读', 'dashboard.overdue': '待回看', 'dashboard.week': '本周收集',
    'items.title': '藏库', 'items.subtitle': '你曾经觉得有价值的，都在这里。', 'items.capture': '收一条链接', 'items.results': '找到 {{count}} 条收藏', 'items.empty': '没有匹配的收藏', 'items.emptyText': '换个关键词，或清空筛选条件试试。', 'items.clear': '清空筛选', 'items.manual': '手工收一条链接', 'items.previous': '上一页', 'items.next': '下一页',
    'newItem.title': '收一条链接', 'newItem.subtitle': '手工添加一条链接。内容形态按域名自动识别，标签数量不限。',
    'stream.title': '收集流', 'stream.subtitle': '从各处收下的链接，在这里汇合。', 'stream.emptyTitle': '第一条链接，从这里开始', 'stream.emptyText': '手工收下一个链接，或连接 Agent 导入浏览器书签与 GitHub Star。', 'stream.connectAgent': '连接 Agent', 'stream.pageItems': '本页 {{count}} 条', 'stream.totalItems': '共 {{count}} 条收藏', 'stream.newer': '较新的收集', 'stream.older': '更早的收集', 'stream.origins': '收集的来路', 'stream.originsText': '这里按首次收藏日期排列，重复采集会补全已有收藏，保留它原来的位置。', 'stream.reportText': '日期分组呈现收藏记录。每次导入的新增、更新与失败结果，请查看 Agent 的采集报告。', 'stream.manageConnections': '管理采集连接', 'stream.sourceRecord': '来源记录：{{source}}',
    'item.openNewTab': '（在新标签页打开原文）', 'item.savedOn': '收藏于 {{date}}', 'item.opened': '打开 {{count}} 次', 'item.unread': '未读', 'item.read': '已读', 'item.archived': '已归档', 'item.details': '详情与笔记', 'item.detailsAria': '查看详情：{{title}}',
    'form.url': '链接', 'form.title': '标题', 'form.summary': '摘要', 'form.tags': '标签', 'form.urlPlaceholder': 'https://example.com/article', 'form.titlePlaceholder': '例如：一篇想稍后再读的文章…', 'form.summaryPlaceholder': '一句话说明，可留空…', 'form.tagsUnlimited': '手工整理，标签数量不限。', 'form.saving': '保存中…',
    'settings.title': '设置', 'settings.subtitle': '收藏慢慢积累，描述它们的词汇也由你定义。', 'settings.language': '界面语言', 'settings.languageHelp': '选择整个 Web 界面使用的语言。',
    'format.today': '今天', 'format.yesterday': '昨天', 'format.daysAgo': '{{count}} 天前', 'format.monthsAgo': '{{count}} 个月前', 'format.yearsAgo': '{{count}} 年前',
    'labels.article': '文章', 'labels.video': '视频', 'labels.repo': '仓库', 'labels.tool': '工具', 'labels.social': '社交', 'labels.doc': '文档', 'labels.other': '其他',
    'labels.manual': '手工收集', 'labels.skill': 'Agent Skill', 'labels.mcp': 'MCP 采集', 'labels.github': 'GitHub Star', 'labels.bookmark': '浏览器书签',
  },
  'zh-TW': {
    'brand': '拾藏', 'nav.dashboard': '回看台', 'nav.stream': '收藏流', 'nav.library': '藏庫', 'nav.settings': '設定', 'nav.capture': '收一則連結', 'nav.signOut': '登出',
    'locale.label': '介面語言', 'locale.en-US': 'English (US)', 'locale.zh-CN': '簡體中文', 'locale.zh-TW': '繁體中文',
    'common.save': '儲存', 'common.cancel': '取消', 'common.delete': '刪除', 'common.edit': '編輯', 'common.loading': '載入中…', 'common.backToLibrary': '返回藏庫',
    'landing.login': '已有帳號，登入', 'landing.start': '從第一則開始', 'landing.how': '看看怎麼用',
    'login.title': '拾藏', 'login.lead': '把散落的連結收進來，再把真正重要的打開。',
    'dashboard.title': '今天，先回收一則。', 'dashboard.subtitle': '曾經收下的好東西，值得再打開一次。', 'dashboard.unread': '查看未讀收藏', 'dashboard.library': '你的藏庫', 'dashboard.total': '收藏', 'dashboard.unreadCount': '未讀', 'dashboard.overdue': '待回看', 'dashboard.week': '本週收集',
    'items.title': '藏庫', 'items.subtitle': '你曾經覺得有價值的，都在這裡。', 'items.capture': '收一則連結', 'items.results': '找到 {{count}} 則收藏', 'items.empty': '沒有符合的收藏', 'items.emptyText': '換個關鍵字，或清除篩選條件再試試。', 'items.clear': '清除篩選', 'items.manual': '手動收一則連結', 'items.previous': '上一頁', 'items.next': '下一頁',
    'newItem.title': '收一則連結', 'newItem.subtitle': '手動加入一則連結。內容型態會依網域自動辨識；標籤數量不限。',
    'stream.title': '收藏流', 'stream.subtitle': '從各處收下的連結，在這裡匯合。', 'stream.emptyTitle': '第一則連結，從這裡開始', 'stream.emptyText': '手動收下一則連結，或連接 Agent 匯入瀏覽器書籤與 GitHub Star。', 'stream.connectAgent': '連接 Agent', 'stream.pageItems': '本頁 {{count}} 則', 'stream.totalItems': '共 {{count}} 則收藏', 'stream.newer': '較新的收藏', 'stream.older': '更早的收藏', 'stream.origins': '收藏的來路', 'stream.originsText': '這裡依首次收藏日期排列；重複收集會補全既有收藏，保留它原來的位置。', 'stream.reportText': '日期分組呈現收藏記錄。每次匯入的新增、更新與失敗結果，請查看 Agent 的收集報告。', 'stream.manageConnections': '管理收集連線', 'stream.sourceRecord': '來源記錄：{{source}}',
    'item.openNewTab': '（在新分頁開啟原文）', 'item.savedOn': '收藏於 {{date}}', 'item.opened': '開啟 {{count}} 次', 'item.unread': '未讀', 'item.read': '已讀', 'item.archived': '已封存', 'item.details': '詳情與筆記', 'item.detailsAria': '查看詳情：{{title}}',
    'form.url': '連結', 'form.title': '標題', 'form.summary': '摘要', 'form.tags': '標籤', 'form.urlPlaceholder': 'https://example.com/article', 'form.titlePlaceholder': '例如：一篇想稍後再讀的文章…', 'form.summaryPlaceholder': '一句話說明，可留空…', 'form.tagsUnlimited': '手動整理，標籤數量不限。', 'form.saving': '儲存中…',
    'settings.title': '設定', 'settings.subtitle': '收藏慢慢累積，描述它們的詞彙也由你定義。', 'settings.language': '介面語言', 'settings.languageHelp': '選擇整個 Web 介面使用的語言。',
    'format.today': '今天', 'format.yesterday': '昨天', 'format.daysAgo': '{{count}} 天前', 'format.monthsAgo': '{{count}} 個月前', 'format.yearsAgo': '{{count}} 年前',
    'labels.article': '文章', 'labels.video': '影片', 'labels.repo': '儲存庫', 'labels.tool': '工具', 'labels.social': '社群', 'labels.doc': '文件', 'labels.other': '其他',
    'labels.manual': '手動收集', 'labels.skill': 'Agent Skill', 'labels.mcp': 'MCP 收集', 'labels.github': 'GitHub Star', 'labels.bookmark': '瀏覽器書籤',
  },
};

export function translate(locale: Locale, key: string, variables: Variables = {}): string {
  const template = messages[locale][key] ?? messages[DEFAULT_LOCALE][key] ?? key;
  return template.replace(/{{(\w+)}}/g, (_, name: string) => String(variables[name] ?? ''));
}

export function getMessages(locale: Locale) {
  return messages[locale];
}
