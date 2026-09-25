-- =============================================================================
-- 0001 · Foundation
-- Extensions, private schemas, deny-by-default privileges and shared helpers.
-- =============================================================================

create extension if not exists pg_trgm    with schema extensions;
create extension if not exists citext     with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists unaccent   with schema extensions;

-- -----------------------------------------------------------------------------
-- Deny by default.
-- Supabase grants every privilege on new objects in `public` to anon and
-- authenticated. We revoke those defaults so every table and function must opt
-- in explicitly with a GRANT, and RLS then applies on top of that grant.
-- -----------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, public;

-- -----------------------------------------------------------------------------
-- Private schemas (not exposed through the Data API).
--   app       : RLS helper functions and internal utilities
--   commerce  : transactional business functions (service_role only, later phases)
--   analytics : aggregate tables (later phases)
-- -----------------------------------------------------------------------------
create schema if not exists app;
create schema if not exists commerce;
create schema if not exists analytics;

revoke all on schema app, commerce, analytics from public;
-- RLS policies run as the querying role, so that role needs USAGE on the
-- schema that holds the helper functions it calls.
grant usage on schema app to anon, authenticated, service_role;
grant usage on schema commerce, analytics to service_role;

alter default privileges for role postgres in schema app       revoke all on functions from public;
alter default privileges for role postgres in schema commerce  revoke all on functions from public;
alter default privileges for role postgres in schema analytics revoke all on functions from public;

-- -----------------------------------------------------------------------------
-- Supported locales
-- -----------------------------------------------------------------------------
create or replace function app.supported_locales()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$ select array['en', 'fr', 'ar']::text[] $$;

-- Localised text is stored as {"en": "...", "fr": "...", "ar": "..."}.
-- Every key must be a supported locale and every value must be a string.
create or replace function app.is_localized_text(value jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select value is not null
     and jsonb_typeof(value) = 'object'
     and not exists (
       select 1
       from jsonb_each(value) as e(k, v)
       where e.k <> all (app.supported_locales())
          or jsonb_typeof(e.v) <> 'string'
     )
$$;

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

grant execute on function app.supported_locales()      to anon, authenticated, service_role;
grant execute on function app.is_localized_text(jsonb) to anon, authenticated, service_role;
