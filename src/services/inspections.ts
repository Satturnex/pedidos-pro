import { supabase } from "../lib/supabase";

export type ItemInspection = {
  orderItemId: string;
  batchId: string | null;
  quantityInspected: number;
  quantityApproved: number;
  quantityRejected: number;
};

export type InspectionTotals = ItemInspection;

export async function getOrderInspections(
  orderDbId: string,
): Promise<InspectionTotals[]> {
  const { data, error } = await supabase
    .from("inspections")
    .select(
      "order_item_id, batch_id, quantity_inspected, quantity_approved, quantity_rejected",
    )
    .eq("order_id", orderDbId)
    .not("order_item_id", "is", null);

  if (error) {
    throw new Error(`Erro ao consultar inspeções: ${error.message}`);
  }

  // Keep NULL as its own bucket so legacy inspections remain visible without
  // being attributed to a production batch.
  const totals = new Map<string, InspectionTotals>();

  for (const row of data ?? []) {
    if (!row.order_item_id) continue;

    const key = `${row.order_item_id}:${row.batch_id ?? "legacy-null"}`;
    const current = totals.get(key) ?? {
      orderItemId: row.order_item_id,
      batchId: row.batch_id,
      quantityInspected: 0,
      quantityApproved: 0,
      quantityRejected: 0,
    };

    current.quantityInspected += Number(row.quantity_inspected);
    current.quantityApproved += Number(row.quantity_approved);
    current.quantityRejected += Number(row.quantity_rejected);

    totals.set(key, current);
  }

  return Array.from(totals.values());
}

export async function registerInspection(input: {
  orderId: string;
  orderItemId: string;
  batchId: string;
  quantityInspected: number;
  quantityApproved: number;
  quantityRejected: number;
  userId: string;
  notes?: string;
}): Promise<void> {
  const {
    orderId,
    orderItemId,
    batchId,
    quantityInspected,
    quantityApproved,
    quantityRejected,
    userId,
    notes,
  } = input;

  if (!orderId || !orderItemId || !batchId || !userId) {
    throw new Error("Pedido, item, lote e usuário são obrigatórios.");
  }

  const values = [quantityInspected, quantityApproved, quantityRejected];

  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("As quantidades devem ser números inteiros não negativos.");
  }

  if (
    quantityInspected <= 0 ||
    quantityApproved + quantityRejected !== quantityInspected
  ) {
    throw new Error(
      "A inspeção deve ser maior que zero e aprovadas + rejeitadas devem ser iguais ao total inspecionado.",
    );
  }


  const { data: item, error: itemError } = await supabase
    .from("order_items")
    .select("id, order_id")
    .eq("id", orderItemId)
    .eq("order_id", orderId)
    .single();

  if (itemError || !item) {
    throw new Error(
      `Não foi possível localizar o item do pedido: ${itemError?.message ?? "item não encontrado"}`,
    );
  }

  const { data: batch, error: batchError } = await supabase.from("production_batches")
    .select("id, order_item_id, status").eq("id", batchId).eq("order_item_id", orderItemId).single();
  if (batchError || !batch) throw new Error(`Não foi possível localizar o lote selecionado: ${batchError?.message ?? "lote não encontrado"}`);
  if (batch.status === "CANCELLED") throw new Error("Não é possível inspecionar um lote cancelado.");
  const { data: entries, error: productionError } = await supabase.from("production_entries")
    .select("quantity_produced").eq("batch_id", batchId);
  if (productionError) throw new Error(`Erro ao consultar produção: ${productionError.message}`);
  const produced = (entries ?? []).reduce((sum, entry) => sum + Number(entry.quantity_produced), 0);
  const { data: priorInspections, error: priorError } = await supabase
    .from("inspections")
    .select("quantity_inspected")
    .eq("order_id", orderId)
    .eq("order_item_id", orderItemId).eq("batch_id", batchId);
  if (priorError) throw new Error(`Erro ao consultar inspeções anteriores: ${priorError.message}`);
  const inspectedAlready = (priorInspections ?? []).reduce((sum, row) => sum + Number(row.quantity_inspected), 0);
  if (quantityInspected > produced - inspectedAlready) {
    throw new Error(`A inspeção excede a produção ainda disponível: ${Math.max(0, produced - inspectedAlready)} unidades.`);
  }

  const { data, error } = await supabase.rpc("register_batch_inspection", {
    p_order_id: orderId, p_order_item_id: orderItemId, p_batch_id: batchId,
    p_quantity_inspected: quantityInspected, p_quantity_approved: quantityApproved,
    p_quantity_rejected: quantityRejected, p_notes: notes || null,
  });
  if (error) {
    if (/register_batch_inspection.*does not exist|could not find the function/i.test(error.message)) throw new Error("Registro seguro indisponível: a RPC transacional register_batch_inspection precisa ser revisada e aplicada no Supabase.");
    throw new Error(`Não foi possível registrar a inspeção: ${error.message}`);
  }
  if (data !== true) throw new Error("O banco não confirmou o lançamento da inspeção.");
}
