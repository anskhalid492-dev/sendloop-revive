select 'tables' k, count(*) v from pg_tables where schemaname='public'
union all select 'functions', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all select 'triggers_all', count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
union all select 'triggers_user', count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal
union all select 'policies', count(*) from pg_policies where schemaname='public'
union all select 'foreign_keys', count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='f'
union all select 'indexes', count(*) from pg_indexes where schemaname='public'
union all select 'enums', count(distinct t.oid) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e'
union all select 'rls_enabled_tables', count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity
union all select 'ext_pg_cron', count(*) from pg_extension where extname='pg_cron'
union all select 'ext_pg_net', count(*) from pg_extension where extname='pg_net'
union all select 'ext_pgcrypto', count(*) from pg_extension where extname='pgcrypto'
union all select 'ext_uuid_ossp', count(*) from pg_extension where extname='uuid-ossp'
union all select 'ext_vault', count(*) from pg_extension where extname='supabase_vault'
order by 1;
