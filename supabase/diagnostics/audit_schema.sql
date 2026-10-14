-- Diagnóstico somente leitura. Executar no SQL Editor do Supabase de destino.
-- Não retorna dados de negócio: apenas estrutura, constraints, funções e RLS.

-- 1) Confirmar as tabelas/colunas que a RPC e o frontend pressupõem.
select table_schema, table_name, column_name, data_type, is_nullable
from information_schema.columns
where (table_schema = 'public' and table_name in ('orders', 'order_items', 'app_users'))
   or table_schema not in ('pg_catalog', 'information_schema', 'auth', 'storage', 'realtime', 'extensions', 'vault')
order by table_schema, table_name, ordinal_position;

-- 2) Todas as FKs da base, incluindo schemas fora de public. Conferir todo FK
-- apontado para public.orders/order_items e identificar históricos adicionais.
select child_ns.nspname as child_schema,
       child.relname as child_table,
       con.conname as constraint_name,
       parent_ns.nspname as parent_schema,
       parent.relname as parent_table,
       string_agg(format('%I -> %I', child_col.attname, parent_col.attname), ', '
                  order by key_col.ordinality) as column_pairs,
       con.confdeltype as on_delete_code,
       con.convalidated as validated
from pg_constraint con
join pg_class child on child.oid = con.conrelid
join pg_namespace child_ns on child_ns.oid = child.relnamespace
join pg_class parent on parent.oid = con.confrelid
join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
cross join lateral unnest(con.conkey, con.confkey) with ordinality
  as key_col(child_attnum, parent_attnum, ordinality)
join pg_attribute child_col on child_col.attrelid = child.oid and child_col.attnum = key_col.child_attnum
join pg_attribute parent_col on parent_col.attrelid = parent.oid and parent_col.attnum = key_col.parent_attnum
where con.contype = 'f'
group by child_ns.nspname, child.relname, con.conname,
         parent_ns.nspname, parent.relname, con.confdeltype, con.convalidated
order by parent_schema, parent_table, child_schema, child_table, constraint_name;

-- 3) Constraints, índices e triggers das tabelas-alvo e suas relações diretas.
select n.nspname as schema_name, c.relname as table_name, con.conname,
       con.contype, pg_get_constraintdef(con.oid, true) as definition,
       con.convalidated
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('orders', 'order_items', 'app_users')
order by c.relname, con.contype, con.conname;

select event_object_schema, event_object_table, trigger_name, action_timing,
       event_manipulation, action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in ('orders', 'order_items')
order by event_object_table, trigger_name, event_manipulation;

-- 4) Confirmar modelo de autorização (colunas, tipo de role e perfis ativos).
select column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'app_users'
order by ordinal_position;
select role, active, count(*) as users
from public.app_users
group by role, active
order by role, active;

-- 5) Estado e políticas RLS de todas as tabelas públicas.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public'
order by tablename, policyname;
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relname;

-- 6) Confirmar se a RPC já existe e seus privilégios no ambiente.
select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result, p.prosecdef as security_definer,
       p.proconfig as settings, p.proacl as privileges
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'delete_order_safely';
