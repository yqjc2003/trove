alter table public.profiles add column if not exists webhook_url text;
alter table public.profiles add column if not exists webhook_events text[] not null default array['item.created','item.updated','item.archived','note.changed']::text[];
notify pgrst, 'reload schema';
