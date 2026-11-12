-- ============================================================================
-- trove · 个人收藏统一管理系统 — 初始 schema
-- 目标库：Supabase Postgres（托管项目）
-- 应用方式：
--   npx supabase@latest db push --linked
--   或在 Supabase Dashboard → SQL Editor 粘贴本文件（幂等，可重复执行）
--
-- 设计要点：
--   · 语义分类一律由 tags 表达，系统不存在独立的 categories 表
--   · 每个用户拥有完全独立的标签空间（unique(user_id, name)）
--   · items 以 (user_id, normalized_url) 唯一，重复录入走 upsert
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text,
  display_name   text,
  reminder_days  integer not null default 14,      -- 超期提醒阈值（天），1–365 可配
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.profiles is '用户档案：与 auth.users 一对一，reminder_days 为超期提醒天数阈值';

-- ---------------------------------------------------------------------------
-- tags —— 唯一分类维度
--   · AI Agent 解读出什么标签就存什么标签（写入时不存在则自动创建）
--   · 用户可在 Web 端 DIY：新建 / 改名 / 删除
-- ---------------------------------------------------------------------------
create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,                       -- 归一后：小写、去 #、折叠空白
  origin     text not null default 'agent',       -- agent（AI 解读产生）| user（用户手动创建）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  check (origin in ('agent', 'user'))
);

comment on table public.tags is '标签：系统唯一的语义分类维度，每用户独立命名空间';

create index if not exists tags_user_idx on public.tags(user_id);

-- ---------------------------------------------------------------------------
-- items —— 收藏主体
-- ---------------------------------------------------------------------------
create table if not exists public.items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  url             text not null,                  -- 原始 URL（302 跳转用）
  normalized_url  text not null,                  -- 去重键（规范化后）
  domain          text not null,
  title           text not null,
  summary         text,
  content_excerpt text,                           -- ≤2KB 排障片段
  content_type    text not null default 'other',   -- article|video|repo|tool|social|doc|other
  source          text not null default 'manual',  -- manual|skill|mcp|github|bookmark
  source_ref      text,                           -- 如 github star 的 full_name / 书签目录
  status          text not null default 'active',  -- active|archived
  archived_at     timestamptz,
  collected_at    timestamptz not null default now(),  -- 「加入收藏的时间」
  read_at         timestamptz,                    -- 首次阅读时间（从未阅读 = null）
  click_count     integer not null default 0,
  last_clicked_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, normalized_url),
  check (content_type in ('article','video','repo','tool','social','doc','other')),
  check (status in ('active','archived')),
  check (click_count >= 0)
);

comment on table public.items is '收藏条目：同一 URL 重复录入走 upsert，collected_at 不被重录刷新';

create index if not exists items_user_status_collected_idx on public.items(user_id, status, collected_at desc);
create index if not exists items_user_domain_idx         on public.items(user_id, domain);
create index if not exists items_user_collected_idx       on public.items(user_id, collected_at desc);
create index if not exists items_reminder_idx             on public.items(user_id, status, read_at, collected_at);

-- ---------------------------------------------------------------------------
-- item_tags —— 收藏 ↔ 标签
-- ---------------------------------------------------------------------------
create table if not exists public.item_tags (
  item_id uuid not null references public.items(id) on delete cascade,
  tag_id  uuid not null references public.tags(id)  on delete cascade,
  primary key (item_id, tag_id)
);

create index if not exists item_tags_tag_idx on public.item_tags(tag_id);

-- ---------------------------------------------------------------------------
-- notes —— Markdown 笔记（每个收藏可多条）
-- ---------------------------------------------------------------------------
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body_md    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_item_idx on public.notes(item_id, created_at desc);

-- ---------------------------------------------------------------------------
-- click_events —— 点击行为（不存 IP）
-- ---------------------------------------------------------------------------
create table if not exists public.click_events (
  id         bigint generated always as identity primary key,
  item_id    uuid not null references public.items(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  source     text not null default 'web',          -- web|mcp|skill|manual
  referrer   text,
  user_agent text
);

create index if not exists click_events_item_idx on public.click_events(item_id, clicked_at desc);
create index if not exists click_events_user_idx on public.click_events(user_id, clicked_at desc);

-- ---------------------------------------------------------------------------
-- api_keys —— Skill / MCP / CLI 的长效凭据（只存哈希）
-- ---------------------------------------------------------------------------
create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  prefix       text not null,                      -- 明文前 12 位，UI 展示用
  key_hash     text not null unique,               -- sha256 hex
  scopes       text[] not null default array['items:read','items:write','notes:write','stats:read'],
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists api_keys_user_idx on public.api_keys(user_id);

-- ---------------------------------------------------------------------------
-- 触发器：updated_at 自动更新
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_items_touch_updated_at on public.items;
create trigger trg_items_touch_updated_at before update on public.items
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_notes_touch_updated_at on public.notes;
create trigger trg_notes_touch_updated_at before update on public.notes
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_profiles_touch_updated_at on public.profiles;
create trigger trg_profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_tags_touch_updated_at on public.tags;
create trigger trg_tags_touch_updated_at before update on public.tags
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 触发器：每个收藏最多 3 个标签（DB 层兜底）
--   pg_advisory_xact_lock 保证并发插入同一 item 时计数检查是原子的，
--   否则两个并发 INSERT 都能看到 count < 3 而突破上限。
-- ---------------------------------------------------------------------------
create or replace function public.enforce_item_tag_limit()
returns trigger
language plpgsql
as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.item_id::text));
  select count(*) into n from public.item_tags where item_id = new.item_id;
  if n >= 3 then
    raise exception 'MAX_TAGS_EXCEEDED' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_item_tag_limit on public.item_tags;
create trigger trg_item_tag_limit before insert on public.item_tags
  for each row execute function public.enforce_item_tag_limit();

-- ---------------------------------------------------------------------------
-- RLS：所有表按 user_id 隔离
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.tags        enable row level security;
alter table public.items       enable row level security;
alter table public.item_tags   enable row level security;
alter table public.notes       enable row level security;
alter table public.click_events enable row level security;
alter table public.api_keys    enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "own tags" on public.tags;
create policy "own tags" on public.tags
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own items" on public.items;
create policy "own items" on public.items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own notes" on public.notes;
create policy "own notes" on public.notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own click_events" on public.click_events;
create policy "own click_events" on public.click_events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own api_keys" on public.api_keys;
create policy "own api_keys" on public.api_keys
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- item_tags 无 user_id，通过 items 反查归属
drop policy if exists "own item_tags" on public.item_tags;
create policy "own item_tags" on public.item_tags
  for all
  using (exists (select 1 from public.items i
                 where i.id = item_tags.item_id and i.user_id = auth.uid()))
  with check (exists (select 1 from public.items i
                 where i.id = item_tags.item_id and i.user_id = auth.uid()));

-- anon 不获得任何表权限；service_role 绕过 RLS（仅服务端持有）
revoke all on public.profiles    from anon;
revoke all on public.tags        from anon;
revoke all on public.items       from anon;
revoke all on public.item_tags   from anon;
revoke all on public.notes       from anon;
revoke all on public.click_events from anon;
revoke all on public.api_keys    from anon;

-- ---------------------------------------------------------------------------
-- RPC A —— 会话型（auth.uid() 自证身份，授予 authenticated）
--   点击追踪：插 click_events + 累加 click_count + 首次点击写 read_at，单事务完成
-- ---------------------------------------------------------------------------
create or replace function public.trove_record_click(
  p_item_id    uuid,
  p_source     text default 'web',
  p_referrer   text default null,
  p_user_agent text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_url text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select i.url into v_url
  from public.items i
  where i.id = p_item_id and i.user_id = v_uid;

  if v_url is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.click_events(item_id, user_id, clicked_at, source, referrer, user_agent)
  values (p_item_id, v_uid, now(), coalesce(p_source,'web'), left(p_referrer,500), left(p_user_agent,300));

  update public.items
     set click_count     = click_count + 1,
         last_clicked_at = now(),
         read_at         = coalesce(read_at, now()),
         updated_at      = now()
   where id = p_item_id;

  return v_url;
end $$;

-- 注意：Supabase 对 public schema 有默认权限（ALTER DEFAULT PRIVILEGES ... GRANT ALL ON
-- FUNCTIONS TO postgres, anon, authenticated, service_role），新函数一建出来 anon 就有
-- EXECUTE。这里必须显式把 anon 也 revoke 掉，只 revoke public 是不够的。
revoke all on function public.trove_record_click(uuid,text,text,text) from public, anon;
grant execute on function public.trove_record_click(uuid,text,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC B —— 双通道型（service_role 走显式 p_user_id；authenticated 走 auth.uid()）
--
--   身份解析规则：
--     · role = authenticated → 一律以 auth.uid() 为准，**忽略传入的 p_user_id**
--       （函数是 SECURITY DEFINER，会绕过 RLS，跨用户写只可能靠这里挡住）
--     · 其它（service_role）  → 信任调用方显式传入的 p_user_id
--
--   为什么用 auth.role() 而不是 current_setting('request.jwt.claim.role')：
--     PostgREST 只设 request.jwt.claims（整段 JSON），不设单个 claim 的 GUC，
--     直接读 request.jwt.claim.role 永远拿到 NULL。auth.role() 会回退到 claims JSON。
--
--   为什么不用 coalesce(auth.uid(), p_user_id)：
--     service_role 的 JWT 里没有 sub，auth.uid() 返回 NULL（::uuid 作用在 NULL 上不报错），
--     但仍要显式分流：会话请求必须忽略 p_user_id，不能靠「uid 为空才用 p_user_id」兜底。
--
--   B-1 标签替换：原子完成「建/取标签 → 清旧绑定 → 绑新标签」
--       ≤3 校验与归属校验都在 delete 之前完成，失败不留半成品
-- ---------------------------------------------------------------------------
create or replace function public.trove_replace_item_tags(
  p_user_id uuid,
  p_item_id uuid,
  p_tags    text[],
  p_origin  text default 'agent'
) returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_id   uuid;
  v_cnt  integer;
  v_keep uuid[] := array[]::uuid[];
  v_role text := coalesce(auth.role(), '');
  v_uid  uuid;
begin
  if v_role = 'authenticated' then
    v_uid := auth.uid();
    if v_uid is null then
      raise exception 'AUTH_REQUIRED' using errcode = '28000';
    end if;
  else
    v_uid := p_user_id;
  end if;

  if not exists (select 1 from public.items i
                 where i.id = p_item_id and i.user_id = v_uid) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 去重 + 归一（小写、trim，剔除空名）
  select coalesce(array_length(array_agg(distinct lower(btrim(t))),1), 0)
    into v_cnt
  from unnest(coalesce(p_tags, array[]::text[])) t
  where btrim(t) <> '';

  if v_cnt > 3 then
    raise exception 'MAX_TAGS_EXCEEDED' using errcode = 'check_violation';
  end if;

  -- ① 先建 / 取标签 id（每用户独立命名空间；origin 区分 AI 产生 vs 用户手动）
  for v_name in
    select distinct lower(btrim(t))
      from unnest(coalesce(p_tags, array[]::text[])) t
     where btrim(t) <> ''
  loop
    insert into public.tags(user_id, name, origin)
    values (v_uid, v_name, coalesce(p_origin,'agent'))
    on conflict (user_id, name) do update set updated_at = now()
    returning id into v_id;
    v_keep := array_append(v_keep, v_id);
  end loop;

  -- ② 清空旧绑定（先删后插 → 触发器计数从 0 起算，无并发竞争）
  delete from public.item_tags where item_id = p_item_id;

  -- ③ 绑新标签
  foreach v_id in array coalesce(v_keep, array[]::uuid[]) loop
    insert into public.item_tags(item_id, tag_id) values (p_item_id, v_id);
  end loop;

  return query select tag_id from public.item_tags where item_id = p_item_id;
end $$;

revoke all on function public.trove_replace_item_tags(uuid,uuid,text[],text) from public, anon;
grant execute on function public.trove_replace_item_tags(uuid,uuid,text[],text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
--   B-2 收藏 upsert
--       p_payload 中「键是否出现」决定该字段是覆盖还是保留旧值
--       明确不参与更新：url / collected_at / status / archived_at / read_at / click_count / last_clicked_at
-- ---------------------------------------------------------------------------
create or replace function public.trove_upsert_item(
  p_user_id uuid,
  p_payload  jsonb
) returns public.items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.items;
  v_role text := coalesce(auth.role(), '');
  v_uid  uuid;
begin
  -- 身份解析同 trove_replace_item_tags：会话请求只认 auth.uid()。
  if v_role = 'authenticated' then
    v_uid := auth.uid();
    if v_uid is null then
      raise exception 'AUTH_REQUIRED' using errcode = '28000';
    end if;
  else
    v_uid := p_user_id;
  end if;

  insert into public.items as t
    (user_id, url, normalized_url, domain, title, summary, content_excerpt,
     content_type, source, source_ref, collected_at)
  values (v_uid, p_payload->>'url', p_payload->>'normalized_url', p_payload->>'domain',
          p_payload->>'title', p_payload->>'summary', p_payload->>'content_excerpt',
          coalesce(nullif(p_payload->>'content_type',''), 'other'),
          coalesce(nullif(p_payload->>'source',''), 'manual'),
          p_payload->>'source_ref', now())
  on conflict (user_id, normalized_url) do update set
    title           = case when p_payload ? 'title'
                            then coalesce(nullif(excluded.title,''), t.title)
                            else t.title end,
    summary         = case when p_payload ? 'summary'
                            then coalesce(nullif(excluded.summary,''), t.summary)
                            else t.summary end,
    content_excerpt = case when p_payload ? 'content_excerpt'
                            then coalesce(nullif(excluded.content_excerpt,''), t.content_excerpt)
                            else t.content_excerpt end,
    content_type    = case when p_payload ? 'content_type'
                            then coalesce(nullif(excluded.content_type,''), t.content_type)
                            else t.content_type end,
    source          = case when p_payload ? 'source'
                            then coalesce(nullif(excluded.source,''), t.source)
                            else t.source end,
    source_ref      = case when p_payload ? 'source_ref'
                            then excluded.source_ref
                            else t.source_ref end,
    updated_at      = now()
  returning * into v_row;
  return v_row;
end $$;

revoke all on function public.trove_upsert_item(uuid, jsonb) from public, anon;
grant execute on function public.trove_upsert_item(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC C —— 新用户注册时自动建 profile（不预置任何标签）
-- ---------------------------------------------------------------------------
create or replace function public.trove_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.trove_handle_new_user();

-- ---------------------------------------------------------------------------
-- 让 PostgREST 立刻重载 schema 缓存
--   新建/替换函数后，PostgREST 的 schema cache 可能还是旧的，
--   表现为 PGRST202「Could not find the function ... in the schema cache」。
--   notify 到不存在的 channel 是空操作，不依赖 PostgREST 是否在跑。
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
