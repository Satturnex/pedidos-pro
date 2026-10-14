-- Registra o cabeçalho e o item de uma entrega em uma única transação.
-- SECURITY INVOKER preserva as políticas RLS existentes para o usuário autenticado.
create or replace function public.register_delivery(
  p_order_id uuid,
  p_order_item_id uuid,
  p_quantity integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_delivery_id uuid;
  v_approved integer;
  v_delivered integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Usuário não autenticado.';
  end if;

  if p_order_id is null or p_order_item_id is null then
    raise exception using errcode = '22023', message = 'Pedido e item são obrigatórios.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception using errcode = '22023', message = 'Informe uma quantidade inteira maior que zero.';
  end if;

  -- Serialize deliveries for this order so concurrent requests cannot both
  -- consume the same approved balance.
  perform 1 from public.orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pedido inexistente ou não acessível.';
  end if;

  perform 1 from public.order_items
   where id = p_order_item_id and order_id = p_order_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Item não pertence a este pedido ou não está acessível.';
  end if;

  select coalesce(sum(i.quantity_approved), 0)::integer
    into v_approved
    from public.inspections i
   where i.order_id = p_order_id and i.order_item_id = p_order_item_id;

  select coalesce(sum(di.quantity), 0)::integer
    into v_delivered
    from public.delivery_items di
   where di.order_id = p_order_id and di.order_item_id = p_order_item_id;

  if p_quantity > v_approved - v_delivered then
    raise exception using
      errcode = 'P0001',
      message = pg_catalog.format(
        'Quantidade excede o saldo aprovado disponível: %s.',
        greatest(0, v_approved - v_delivered)
      );
  end if;

  insert into public.deliveries (
    order_id, status, actual_delivery_date, created_by
  ) values (
    p_order_id, 'DELIVERED', current_date, auth.uid()
  ) returning id into v_delivery_id;

  insert into public.delivery_items (
    delivery_id, order_id, order_item_id, quantity
  ) values (
    v_delivery_id, p_order_id, p_order_item_id, p_quantity
  );

  return v_delivered + p_quantity;
end;
$function$;

revoke all on function public.register_delivery(uuid, uuid, integer)
  from public, anon;
grant execute on function public.register_delivery(uuid, uuid, integer)
  to authenticated;
