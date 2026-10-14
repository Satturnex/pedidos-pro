import { supabase } from "../lib/supabase";

export type DbOrder = {
  id: string;
  internal_code: string;
  petrobras_order_number: string | null;
  is_contract: boolean | null;
  contract_number: string | null;
  delu_order_number: string | null;
  description: string | null;
  order_date: string | null;
  production_release_date: string | null;
  expected_delivery_date: string | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DbOrderItem = {
  id: string;
  order_id: string;
  item_number: string;
  description: string;
  quantity_ordered: number;
  unit_of_measure: string;
  expected_delivery_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderWithItems = DbOrder & {
  items: DbOrderItem[];
};

export async function getOrders(): Promise<OrderWithItems[]> {
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (ordersError) {
    throw new Error(`Erro ao carregar pedidos: ${ordersError.message}`);
  }

  if (!orders?.length) {
    return [];
  }

  const orderIds = orders.map((order) => order.id);

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("*")
    .in("order_id", orderIds)
    .order("item_number");

  if (itemsError) {
    throw new Error(`Erro ao carregar itens: ${itemsError.message}`);
  }

  return orders.map((order) => ({
    ...order,
    items: (items ?? []).filter((item) => item.order_id === order.id),
  }));
}

export async function createOrderWithFirstItem(input: {
  petrobras: string;
  delu: string;
  description: string;
  delivery: string;
  contract: boolean;
  itemDescription: string;
  sku: string;
  quantity: number;
  userId: string;
}) {
  if (!input.userId) throw new Error("Usuário autenticado obrigatório.");
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
    throw new Error("A quantidade deve ser um número inteiro maior que zero.");
  }
  const internalCode = `PED-${new Date().getFullYear()}-${crypto
    .randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      internal_code: internalCode,
      petrobras_order_number: input.petrobras || null,
      delu_order_number: input.delu || null,
      description: input.description,
      expected_delivery_date: input.delivery || null,
      is_contract: input.contract,
      status: 'IN_PROGRESS',
      created_by: input.userId,
    })
    .select("*")
    .single();

  if (orderError) {
    throw new Error(`Erro ao criar pedido: ${orderError.message}`);
  }

  const { error: itemError } = await supabase.from("order_items").insert({
    order_id: order.id,
    item_number: input.sku || "1",
    description: input.itemDescription,
    quantity_ordered: input.quantity,
    unit_of_measure: "UN",
    expected_delivery_date: input.delivery || null,
    status: 'IN_PROGRESS',
  });

  if (itemError) {
    // Evita deixar um pedido sem o primeiro item caso a segunda operação falhe.
    const { error: rollbackError } = await supabase
      .from("orders")
      .delete()
      .eq("id", order.id);

    if (rollbackError) {
      throw new Error(
        `O pedido ${internalCode} foi criado, mas o item falhou: ${itemError.message}. ` +
          `Também não foi possível remover o pedido incompleto: ${rollbackError.message}`,
      );
    }

    throw new Error(
      `Erro ao criar item; o pedido incompleto foi removido: ${itemError.message}`,
    );
  }

  return order as DbOrder;
}

/**
 * Cancela sem remover dados operacionais. A atualização usa o status anterior
 * como condição para impedir duas confirmações concorrentes; a RLS continua
 * sendo a autoridade de permissões no banco.
 */
export async function cancelOrder(input: {
  orderId: string;
  currentStatus: string;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (!input.orderId || !reason) throw new Error("Informe o motivo do cancelamento.");
  if (input.currentStatus === "CANCELLED") throw new Error("Este pedido já está cancelado.");

  const { data: current, error: readError } = await supabase
    .from("orders")
    .select("notes")
    .eq("id", input.orderId)
    .eq("status", input.currentStatus)
    .maybeSingle();
  if (readError) throw new Error(`Não foi possível validar o pedido: ${readError.message}`);
  if (!current) throw new Error("O pedido mudou ou não está acessível. Atualize a tela e tente novamente.");

  const marker = "Motivo do cancelamento:";
  const oldNotes = current.notes?.trim() ?? "";
  const notes = oldNotes
    ? `${oldNotes}\n\n${marker} ${reason}`
    : `${marker} ${reason}`;
  let update = supabase
    .from("orders")
    .update({ status: "CANCELLED", notes })
    .eq("id", input.orderId)
    .eq("status", input.currentStatus);
  update = current.notes === null
    ? update.is("notes", null)
    : update.eq("notes", current.notes);
  const { data, error } = await update.select("id, status").maybeSingle();
  if (error) {
    if (/check constraint|constraint|enum|invalid input/i.test(error.message)) {
      throw new Error("O banco não aceita o status CANCELLED. É necessária uma migração revisada para habilitar o status antes de cancelar.");
    }
    throw new Error(`Não foi possível cancelar o pedido: ${error.message}`);
  }
  if (!data) throw new Error("O pedido já foi alterado ou cancelado por outra operação. Atualize a tela.");
  return data;
}

/** Exclusão física exige uma RPC transacional revisada no PostgreSQL. */
export async function deleteOrderSafely(orderId: string) {
  if (!orderId) throw new Error("Não foi possível identificar o UUID do pedido.");
  const { data, error } = await supabase.rpc("delete_order_safely", { p_order_id: orderId });
  if (error) {
    if (
      error.code === "PGRST202" ||
      /function .*delete_order_safely.* does not exist|could not find the function/i.test(error.message)
    ) {
      throw new Error("Exclusão bloqueada: a RPC transacional delete_order_safely ainda não foi revisada e aplicada no Supabase.");
    }
    if (error.code === "42501") {
      throw new Error("Você não tem permissão para excluir pedidos. A ação exige uma conta ativa com perfil OWNER ou ADMIN.");
    }
    if (error.code === "P0002") {
      throw new Error("Este pedido não existe mais. Atualize a lista antes de tentar novamente.");
    }
    if (error.code === "P0001") {
      throw new Error(error.message || "Este pedido tem registros relacionados. Cancele o pedido para preservar o histórico.");
    }
    if (error.code === "23503") {
      const constraint = error.details ? ` (${error.details})` : "";
      throw new Error(`A exclusão foi impedida por uma referência de integridade no banco${constraint}. Os dados foram preservados; atualize o projeto e, se o pedido tiver histórico, cancele-o para preservá-lo.`);
    }
    const diagnostic = [error.message, error.details, error.hint].filter(Boolean).join(" — ");
    throw new Error(`Não foi possível excluir o pedido. Nenhuma exclusão foi confirmada.${diagnostic ? ` Detalhe: ${diagnostic}` : ""}`);
  }
  if (data !== true) throw new Error("O banco não confirmou a exclusão segura do pedido.");
}
