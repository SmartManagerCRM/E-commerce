-- Structural security checks: these fail when a new table or function is
-- added without RLS / explicit privileges / a pinned search_path.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity),
  null,
  'Every table in public has row level security enabled'
);

select is(
  (select array_agg(format('%s.%s', n.nspname, p.proname) order by 1)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app', 'commerce', 'analytics')
      and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  null,
  'Every SECURITY DEFINER function pins its search_path'
);

select is(
  (select array_agg(format('%s.%s', n.nspname, p.proname) order by 1)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'execute')
      and p.proname not in ('resolve_storefront', 'get_invitation')),
  null,
  'anon can only execute allow-listed public functions'
);

select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm')
      and (has_table_privilege('anon', c.oid, 'insert')
        or has_table_privilege('anon', c.oid, 'update')
        or has_table_privilege('anon', c.oid, 'delete')
        or has_table_privilege('anon', c.oid, 'truncate'))),
  null,
  'anon has no write privilege on any public table'
);

select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm')
      and has_table_privilege('anon', c.oid, 'select')),
  array['currencies', 'features', 'plan_features', 'plans'],
  'anon can only read public reference tables'
);

select ok(
  not has_function_privilege('authenticated', 'app.write_audit(uuid, uuid, text, text, text, jsonb, inet, text)', 'execute'),
  'Only service_role can write service-level audit entries'
);

select * from finish();
rollback;
