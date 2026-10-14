import { supabase } from "../lib/supabase";

export type ProductionBatch = {
  id: string;
  order_item_id: string;
  batch_number: string;
  quantity_planned: number;
  status: string;
  completion_date?: string | null;
  notes?: string | null;
  quantity_produced: number;
  balance: number;
  entries: ProductionEntry[];
};

export type ProductionEntry = {
  id: string;
  batch_id: string;
  quantity_produced: number;
  production_date: string;
  notes: string | null;
};

export type ItemProduction = {
  orderItemId: string;
  quantityOrdered: number;
  quantityPlanned: number;
  quantityProduced: number;
  batches: ProductionBatch[];
};

export async function getOrderProduction(orderDbId: string): Promise<ItemProduction[]> {
  const { data: items, error: itemsError } = await supabase
    .from("order_items").select("id, quantity_ordered").eq("order_id", orderDbId);
  if (itemsError) throw new Error(`Erro ao consultar itens: ${itemsError.message}`);
  if (!items?.length) return [];

  const itemIds = items.map((item) => item.id);
  const { data: batches, error: batchesError } = await supabase
    .from("production_batches")
    .select("id, order_item_id, batch_number, quantity_planned, status, completion_date, notes")
    .in("order_item_id", itemIds).order("batch_number");
  if (batchesError) throw new Error(`Erro ao consultar lotes: ${batchesError.message}`);

  const batchRows = batches ?? [];
  const ids = batchRows.map((batch) => batch.id);
  let entries: ProductionEntry[] = [];
  if (ids.length) {
    const result = await supabase.from("production_entries")
      .select("id, batch_id, quantity_produced, production_date, notes")
      .in("batch_id", ids).order("production_date", { ascending: true });
    if (result.error) throw new Error(`Erro ao consultar lançamentos: ${result.error.message}`);
    entries = (result.data ?? []) as ProductionEntry[];
  }

  return items.map((item) => {
    const itemBatches = batchRows.filter((batch) => batch.order_item_id === item.id).map((batch) => {
      const batchEntries = entries.filter((entry) => entry.batch_id === batch.id);
      const produced = batchEntries.reduce((sum, entry) => sum + Number(entry.quantity_produced), 0);
      const planned = Number(batch.quantity_planned);
      return { ...batch, quantity_planned: planned, quantity_produced: produced,
        balance: Math.max(0, planned - produced), entries: batchEntries } as ProductionBatch;
    });
    return {
      orderItemId: item.id,
      quantityOrdered: Number(item.quantity_ordered),
      quantityPlanned: itemBatches.filter((batch) => batch.status !== "CANCELLED").reduce((sum, batch) => sum + batch.quantity_planned, 0),
      quantityProduced: itemBatches.reduce((sum, batch) => sum + batch.quantity_produced, 0),
      batches: itemBatches,
    };
  });
}

export async function createProductionBatch(input: {
  orderItemId: string; batchNumber: string; quantityPlanned: number; notes?: string;
}): Promise<string> {
  const number = input.batchNumber.trim();
  if (!number) throw new Error("Informe o número do lote.");
  if (!Number.isSafeInteger(input.quantityPlanned) || input.quantityPlanned <= 0) throw new Error("A quantidade planejada deve ser um inteiro maior que zero.");
  const { data: item, error: itemError } = await supabase.from("order_items")
    .select("id, quantity_ordered").eq("id", input.orderItemId).single();
  if (itemError || !item) throw new Error(`Não foi possível localizar o item: ${itemError?.message ?? "item não encontrado"}`);
  const { data: existing, error: batchesError } = await supabase.from("production_batches")
    .select("quantity_planned, status").eq("order_item_id", input.orderItemId);
  if (batchesError) throw new Error(`Erro ao validar lotes existentes: ${batchesError.message}`);
  const planned = (existing ?? []).filter((batch) => batch.status !== "CANCELLED")
    .reduce((sum, batch) => sum + Number(batch.quantity_planned), 0);
  if (planned + input.quantityPlanned > Number(item.quantity_ordered)) {
    throw new Error(`A quantidade planejada excede o saldo do item: ${Math.max(0, Number(item.quantity_ordered) - planned)} unidades.`);
  }
  const { data, error } = await supabase.rpc("create_production_batch", {
    p_order_item_id: input.orderItemId, p_batch_number: number,
    p_quantity_planned: input.quantityPlanned, p_notes: input.notes?.trim() || null,
  });
  if (error) {
    if (/create_production_batch.*does not exist|could not find the function/i.test(error.message)) throw new Error("Criação segura indisponível: a RPC transacional create_production_batch precisa ser revisada e aplicada no Supabase.");
    throw new Error(`Não foi possível criar o lote: ${error.message}`);
  }
  if (typeof data !== "string") throw new Error("O banco não confirmou a criação do lote.");
  return data;
}

export async function registerProduction(input: {
  orderItemId: string; batchId: string; quantityProduced: number; userId: string;
  productionDate?: string; notes?: string;
}): Promise<void> {
  if (!input.orderItemId || !input.batchId || !input.userId) throw new Error("Item, lote e usuário são obrigatórios.");
  if (!Number.isSafeInteger(input.quantityProduced) || input.quantityProduced <= 0) throw new Error("A quantidade produzida deve ser um inteiro maior que zero.");
  const { data: item, error: itemError } = await supabase.from("order_items")
    .select("id, quantity_ordered").eq("id", input.orderItemId).single();
  if (itemError || !item) throw new Error(`Não foi possível localizar o item: ${itemError?.message ?? "item não encontrado"}`);
  const { data: batches, error: batchesError } = await supabase.from("production_batches")
    .select("id, order_item_id, status").eq("order_item_id", input.orderItemId);
  if (batchesError) throw new Error(`Erro ao validar lotes: ${batchesError.message}`);
  const batch = (batches ?? []).find((entry) => entry.id === input.batchId);
  if (!batch) throw new Error("O lote não pertence ao item informado.");
  if (batch.status === "CANCELLED") throw new Error("Não é possível lançar produção em um lote cancelado.");
  const allBatchIds = (batches ?? []).map((entry) => entry.id);
  const { data: entries, error: entriesError } = allBatchIds.length
    ? await supabase.from("production_entries").select("quantity_produced").in("batch_id", allBatchIds)
    : { data: [], error: null };
  if (entriesError) throw new Error(`Erro ao consultar produção acumulada: ${entriesError.message}`);
  const accumulated = (entries ?? []).reduce((sum, entry) => sum + Number(entry.quantity_produced), 0);
  if (accumulated + input.quantityProduced > Number(item.quantity_ordered)) {
    throw new Error(`A produção acumulada excede a quantidade pedida: ${Math.max(0, Number(item.quantity_ordered) - accumulated)} unidades disponíveis.`);
  }
  const { data, error } = await supabase.rpc("register_production_entry", {
    p_order_item_id: input.orderItemId, p_batch_id: input.batchId,
    p_quantity_produced: input.quantityProduced,
    p_production_date: input.productionDate || new Date().toISOString().slice(0, 10),
    p_notes: input.notes?.trim() || null,
  });
  if (error) {
    if (/register_production_entry.*does not exist|could not find the function/i.test(error.message)) throw new Error("Registro seguro indisponível: a RPC transacional register_production_entry precisa ser revisada e aplicada no Supabase.");
    throw new Error(`Não foi possível registrar a produção: ${error.message}`);
  }
  if (data !== true) throw new Error("O banco não confirmou o lançamento de produção.");
}
