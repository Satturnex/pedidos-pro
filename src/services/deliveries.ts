import { supabase } from "../lib/supabase";

export type ItemDelivery = {
  orderItemId: string;
  quantityDelivered: number;
};

export async function getOrderDeliveries(
  orderDbId: string,
): Promise<ItemDelivery[]> {
  const { data, error } = await supabase
    .from("delivery_items")
    .select("order_item_id, quantity")
    .eq("order_id", orderDbId);

  if (error) {
    throw new Error(`Erro ao consultar entregas: ${error.message}`);
  }

  const totals = new Map<string, ItemDelivery>();

  for (const row of data ?? []) {
    const current = totals.get(row.order_item_id) ?? {
      orderItemId: row.order_item_id,
      quantityDelivered: 0,
    };

    current.quantityDelivered += Number(row.quantity);
    totals.set(row.order_item_id, current);
  }

  return Array.from(totals.values());
}

export async function registerDelivery(input: {
  orderId: string;
  orderItemId: string;
  quantity: number;
}): Promise<number> {
  const { orderId, orderItemId, quantity } = input;

  if (!orderId || !orderItemId) {
    throw new Error("Pedido e item são obrigatórios.");
  }
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error("Informe uma quantidade inteira maior que zero.");
  }

  // This RPC performs validation and both inserts in one PostgreSQL transaction.
  // The authenticated user is read server-side so the browser cannot impersonate
  // another user when setting deliveries.created_by.
  const { data, error } = await supabase.rpc("register_delivery", {
    p_order_id: orderId,
    p_order_item_id: orderItemId,
    p_quantity: quantity,
  });

  if (error) {
    if (
      error.code === "PGRST202" ||
      /register_delivery.*does not exist|could not find the function/i.test(error.message)
    ) {
      throw new Error("Registro seguro indisponível: a migração register_delivery precisa ser aplicada no Supabase.");
    }
    if (error.code === "42501") {
      throw new Error(`Você não tem permissão para registrar entregas. Detalhe: ${error.message}`);
    }
    throw new Error(`Não foi possível registrar a entrega: ${error.message}`);
  }

  if (typeof data !== "number" || !Number.isSafeInteger(data)) {
    throw new Error("O banco não confirmou a gravação da entrega.");
  }
  return data;
}
