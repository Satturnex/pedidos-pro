
-- Exclusão física conservadora de pedidos sem histórico operacional.
-- Bloqueia a exclusão se houver qualquer registro relacionado ao pedido
-- ou aos seus itens, exceto os próprios order_items.
-- FKs compostas são verificadas pelas colunas exatas.
-- Notificações e demais históricos nunca são apagados por esta função.

create or replace function public.delete_order_safely(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_fk record;
  v_has_dependency boolean;
begin
  -- Autenticação e autorização
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'Usuário não autenticado.';
  end if;

  if not exists (
    select 1
    from public.app_users au
    where au.user_id = auth.uid()
      and au.active is true
      and au.role in ('OWNER', 'ADMIN')
  ) then
    raise exception using
      errcode = '42501',
      message = 'Somente usuários ativos OWNER ou ADMIN podem excluir pedidos.';
  end if;

  if p_order_id is null then
    raise exception using
      errcode = '22023',
      message = 'Informe o identificador do pedido.';
  end if;

  -- Bloqueia o pedido durante a validação.
  perform 1
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Pedido inexistente.';
  end if;

  -- Descobre todas as FKs que apontam para orders. A única relação ignorada
  -- aqui é order_items.order_id -> orders.id, pois esses itens serão removidos
  -- abaixo. Outras FKs da própria order_items também precisam ser avaliadas.
  for v_fk in
    select
      child_ns.nspname as child_schema,
      child.relname as child_table,
      con.conname as constraint_name,
      pg_catalog.cardinality(con.conkey) as key_columns,
      (
        select pg_catalog.string_agg(
          pg_catalog.format('c.%I = o.%I',
            child_col.attname, parent_col.attname),
          ' AND ' order by key_col.ordinality
        )
        from unnest(con.conkey, con.confkey)
          with ordinality as key_col(child_attnum, parent_attnum, ordinality)
        join pg_catalog.pg_attribute child_col
          on child_col.attrelid = child.oid
         and child_col.attnum = key_col.child_attnum
        join pg_catalog.pg_attribute parent_col
          on parent_col.attrelid = parent.oid
         and parent_col.attnum = key_col.parent_attnum
      ) as join_condition
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class parent
      on parent.oid = con.confrelid
    join pg_catalog.pg_namespace parent_ns
      on parent_ns.oid = parent.relnamespace
    join pg_catalog.pg_class child
      on child.oid = con.conrelid
    join pg_catalog.pg_namespace child_ns
      on child_ns.oid = child.relnamespace
    where con.contype = 'f'
      and parent_ns.nspname = 'public'
      and parent.relname = 'orders'
      and not (
        child_ns.nspname = 'public'
        and child.relname = 'order_items'
        and pg_catalog.cardinality(con.conkey) = 1
        and exists (
          select 1
          from unnest(con.conkey, con.confkey) as pair(child_attnum, parent_attnum)
          join pg_catalog.pg_attribute child_col
            on child_col.attrelid = child.oid and child_col.attnum = pair.child_attnum
          join pg_catalog.pg_attribute parent_col
            on parent_col.attrelid = parent.oid and parent_col.attnum = pair.parent_attnum
          where child_col.attname = 'order_id' and parent_col.attname = 'id'
        )
      )
  loop
    execute pg_catalog.format(
      'select exists (
         select 1
         from %I.%I c
         join public.orders o on %s
         where o.id = $1
       )',
      v_fk.child_schema,
      v_fk.child_table,
      v_fk.join_condition
    )
    into v_has_dependency
    using p_order_id;

    if v_has_dependency then
      raise exception using
        -- Use a business-rule SQLSTATE; reserve 23503 for actual FK failures.
        errcode = 'P0001',
        message = pg_catalog.format(
          'Exclusão bloqueada: existem registros relacionados em %I.%I. Cancele o pedido para preservar o histórico.',
          v_fk.child_schema,
          v_fk.child_table
        );
    end if;
  end loop;

  -- Bloqueia os itens antes de verificar suas dependências.
  perform i.id
  from public.order_items i
  where i.order_id = p_order_id
  order by i.id
  for update;

  -- Descobre todas as FKs que apontam para order_items.
  -- Verifica todas as colunas de cada FK, inclusive as compostas.
  for v_fk in
    select
      child_ns.nspname as child_schema,
      child.relname as child_table,
      con.conname as constraint_name,
      (
        select pg_catalog.string_agg(
          pg_catalog.format('c.%I = i.%I',
            child_col.attname, parent_col.attname),
          ' AND ' order by key_col.ordinality
        )
        from unnest(con.conkey, con.confkey)
          with ordinality as key_col(child_attnum, parent_attnum, ordinality)
        join pg_catalog.pg_attribute child_col
          on child_col.attrelid = child.oid
         and child_col.attnum = key_col.child_attnum
        join pg_catalog.pg_attribute parent_col
          on parent_col.attrelid = parent.oid
         and parent_col.attnum = key_col.parent_attnum
      ) as join_condition
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class parent
      on parent.oid = con.confrelid
    join pg_catalog.pg_namespace parent_ns
      on parent_ns.oid = parent.relnamespace
    join pg_catalog.pg_class child
      on child.oid = con.conrelid
    join pg_catalog.pg_namespace child_ns
      on child_ns.oid = child.relnamespace
    where con.contype = 'f'
      and parent_ns.nspname = 'public'
      and parent.relname = 'order_items'
  loop
    execute pg_catalog.format(
      'select exists (
         select 1
         from %I.%I c
         join public.order_items i on %s
         where i.order_id = $1
       )',
      v_fk.child_schema,
      v_fk.child_table,
      v_fk.join_condition
    )
    into v_has_dependency
    using p_order_id;

    if v_has_dependency then
      raise exception using
        errcode = 'P0001',
        message = pg_catalog.format(
          'Exclusão bloqueada: existem registros relacionados aos itens em %I.%I. Cancele o pedido para preservar o histórico.',
          v_fk.child_schema,
          v_fk.child_table
        );
    end if;
  end loop;

  -- Somente os itens sem histórico dependente podem ser removidos.
  delete from public.order_items
  where order_id = p_order_id;

  delete from public.orders
  where id = p_order_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Pedido não foi excluído.';
  end if;

  return true;
end;
$function$;

-- Restringe a execução da RPC.
revoke all on function public.delete_order_safely(uuid)
  from public, anon;

grant execute on function public.delete_order_safely(uuid)
  to authenticated;
