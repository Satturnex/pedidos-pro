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
  userId: string;
}): Promise<void> {
  const { orderId, orderItemId, quantity, userId } = input;

  if (!orderId || !orderItemId || !userId) {
    throw new Error("Pedido, item e usuário são obrigatórios.");
  }

  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error("Informe uma quantidade inteira maior que zero.");
  }

  const { data: item, error: itemError } = await supabase
    .from("order_items")
    .select("id, order_id")
    .eq("id", orderItemId)
    .eq("order_id", orderId)
    .single();

  if (itemError || !item) {
    throw new Error("Não foi possível localizar o item do pedido.");
  }

  const { data: inspections, error: inspectionError } = await supabase
    .from("inspections")
    .select("quantity_approved")
    .eq("order_id", orderId)
    .eq("order_item_id", orderItemId);

  if (inspectionError) {
    throw new Error(`Erro ao consultar aprovações: ${inspectionError.message}`);
  }

  const approved = (inspections ?? []).reduce(
    (total, row) => total + Number(row.quantity_approved),
    0,
  );

  const { data: deliveries, error: deliveryItemsError } = await supabase
    .from("delivery_items")
    .select("quantity")
    .eq("order_id", orderId)
    .eq("order_item_id", orderItemId);

  if (deliveryItemsError) {
    throw new Error(
      `Erro ao consultar entregas anteriores: ${deliveryItemsError.message}`,
    );
  }

  const alreadyDelivered = (deliveries ?? []).reduce(
    (total, row) => total + Number(row.quantity),
    0,
  );

  if (quantity > approved - alreadyDelivered) {
    throw new Error(
      `Quantidade excede o saldo aprovado disponível: ${Math.max(
        0,
        approved - alreadyDelivered,
      )}.`,
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: delivery, error: createError } = await supabase
    .from("deliveries")
    .insert({
      order_id: orderId,
      status: "DELIVERED",
      actual_delivery_date: today,
      created_by: userId,
    })
    .select("id")
    .single();

  if (createError || !delivery) {
    throw new Error(
      `Erro ao criar entrega: ${createError?.message ?? "registro não retornado"}`,
    );
  }

  const { error: itemInsertError } = await supabase
    .from("delivery_items")
    .insert({
      delivery_id: delivery.id,
      order_id: orderId,
      order_item_id: orderItemId,
      quantity,
    });

  if (itemInsertError) {
    await supabase.from("deliveries").delete().eq("id", delivery.id);

    throw new Error(
      `Erro ao registrar item da entrega: ${itemInsertError.message}`,
    );
  }
}
