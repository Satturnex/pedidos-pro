import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  Bell,
  Boxes,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Clock3,
  FilePlus2,
  FileSpreadsheet,
  Filter,
  Trash2,
  LayoutDashboard,
  Menu,
  Moon,
  Package,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Truck,
  X,
} from "lucide-react";
import type { Profile } from "./components/AuthGate";
import { LogOut } from "lucide-react";
import {
  getOrders,
  createOrderWithFirstItem,
  cancelOrder,
  deleteOrderSafely,
  type OrderWithItems,
} from "./services/orders";

import { createProductionBatch, getOrderProduction, registerProduction, type ItemProduction } from "./services/production";
import {
  getOrderInspections,
  registerInspection,
} from "./services/inspections";

import { getOrderDeliveries, registerDelivery } from "./services/deliveries";
import { createProblemReport } from "./services/reports";

type Item = {
  id: string;
  description: string;
  sku: string;
  quantity: number;
  produced: number;
  inspected: number;
  approved: number;
  inspectionsByBatch: Record<string, number>;
  delivered: number;
  next: string;
  due: string;
  status: string;
};
type Order = {
  id: string;
  dbId?: string;
  dbStatus?: string;
  cancelled?: boolean;
  petrobras: string;
  contract: boolean;
  delu: string;
  description: string;
  delivery: string;
  released: string;
  si: boolean;
  inspection: string;
  pimRequested: boolean;
  pimResult: string;
  databook: string;
  nf: string;
  nfDate: string;
  appointment: string;
  delivered: boolean;
  items: Item[];
};
const initialOrders: Order[] = [
  {
    id: "PED-2026-001",
    petrobras: "4500129876",
    contract: true,
    delu: "DL-8831",
    description: "Conjunto de válvulas industriais",
    delivery: "2026-10-20",
    released: "2026-09-28",
    si: true,
    inspection: "2026-10-10",
    pimRequested: true,
    pimResult: "Aguardando",
    databook: "",
    nf: "",
    nfDate: "",
    appointment: "",
    delivered: false,
    items: [
      {
        id: "IT-001",
        description: "Válvula de controle 2”",
        sku: "VC-200",
        quantity: 100,
        produced: 100,
        inspected: 60,
        approved: 60,
        inspectionsByBatch: {},
        delivered: 30,
        next: "Inspecionar saldo",
        due: "2026-10-15",
        status: "Em andamento",
      },
      {
        id: "IT-002",
        description: "Kit de vedação industrial",
        sku: "KV-042",
        quantity: 50,
        produced: 30,
        inspected: 20,
        approved: 20,
        inspectionsByBatch: {},
        delivered: 10,
        next: "Produzir saldo",
        due: "2026-10-16",
        status: "Em andamento",
      },
    ],
  },
  {
    id: "PED-2026-002",
    petrobras: "4500130021",
    contract: false,
    delu: "DL-8838",
    description: "Flanges e conexões especiais",
    delivery: "2026-10-16",
    released: "2026-09-20",
    si: false,
    inspection: "",
    pimRequested: false,
    pimResult: "Não solicitada",
    databook: "",
    nf: "",
    nfDate: "",
    appointment: "",
    delivered: false,
    items: [
      {
        id: "IT-003",
        description: "Flange aço carbono DN80",
        sku: "FL-080",
        quantity: 40,
        produced: 40,
        inspected: 0,
        approved: 0,
        inspectionsByBatch: {},
        delivered: 0,
        next: "Solicitar SI",
        due: "2026-10-13",
        status: "Atrasado",
      },
    ],
  },
  {
    id: "PED-2026-003",
    petrobras: "4500130170",
    contract: true,
    delu: "DL-8840",
    description: "Spools fabricados",
    delivery: "2026-10-28",
    released: "2026-10-01",
    si: true,
    inspection: "2026-10-11",
    pimRequested: false,
    pimResult: "Não aplicável",
    databook: "2026-10-12",
    nf: "",
    nfDate: "",
    appointment: "",
    delivered: false,
    items: [
      {
        id: "IT-004",
        description: "Spool DN100 SCH40",
        sku: "SP-100",
        quantity: 12,
        produced: 12,
        inspected: 12,
        approved: 12,
        inspectionsByBatch: {},
        delivered: 0,
        next: "Emitir NF",
        due: "2026-10-19",
        status: "Em andamento",
      },
    ],
  },
  {
    id: "PED-2026-004",
    petrobras: "4500127600",
    contract: true,
    delu: "DL-8802",
    description: "Componentes de reposição",
    delivery: "2026-10-08",
    released: "2026-08-15",
    si: true,
    inspection: "2026-09-01",
    pimRequested: true,
    pimResult: "Aceita",
    databook: "2026-09-04",
    nf: "NF-000458",
    nfDate: "2026-09-05",
    appointment: "2026-09-08",
    delivered: true,
    items: [
      {
        id: "IT-005",
        description: "Eixo de acionamento",
        sku: "EA-300",
        quantity: 8,
        produced: 8,
        inspected: 8,
        approved: 8,
        inspectionsByBatch: {},
        delivered: 8,
        next: "Concluído",
        due: "",
        status: "Entregue",
      },
    ],
  },
];

function mapDbOrder(db: OrderWithItems): Order {
  const items: Item[] = db.items.map((item) => ({
    id: item.id,
    description: item.description,
    sku: item.item_number,
    quantity: Number(item.quantity_ordered),
    produced: 0,
    inspected: 0,
    approved: 0,
    inspectionsByBatch: {},
    delivered: 0,
    next: "Liberação para produção",
    due: item.expected_delivery_date ?? "",
    status:
      item.status === "COMPLETED"
        ? "Entregue"
        : item.status === "CANCELLED"
          ? "Cancelado"
          : item.status === "PARTIAL"
            ? "Parcial"
            : "Em andamento",
  }));

  return {
    id: db.internal_code,
    dbId: db.id,
    dbStatus: db.status,
    cancelled: db.status === "CANCELLED",
    petrobras: db.petrobras_order_number ?? "",
    contract: db.is_contract ?? false,
    delu: db.delu_order_number ?? "",
    description: db.description ?? "",
    delivery: db.expected_delivery_date ?? "",
    released: db.production_release_date ?? "",
    si: false,
    inspection: "",
    pimRequested: false,
    pimResult: "Não solicitada",
    databook: "",
    nf: "",
    nfDate: "",
    appointment: "",
    delivered: db.status === "COMPLETED",
    items,
  };
}

const moneyDate = (s: string) =>
  s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const stages = [
  "Liberação para produção",
  "Solicitar SI",
  "Inspeção",
  "Dispensa de PIM",
  "Databook",
  "Emitir NF",
  "Agendamento",
  "Entrega finalizada",
];
type AppProps = {
  profile: Profile;
  onLogout: () => Promise<void>;
};

export default function App({ profile, onLogout }: AppProps) {
  const createOrderLock = useRef(false);
  const destructiveLock = useRef(false);
  const [actionModal, setActionModal] = useState<"delete" | "cancel" | null>(null);
  const [actionSaving, setActionSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const productionLock = useRef(false);
  const inspectionLock = useRef(false);
  const deliveryLock = useRef(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const reportLock = useRef(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSaving, setReportSaving] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportSuccess, setReportSuccess] = useState(false);
  const [report, setReport] = useState({ kind: "BUG", title: "", description: "", expected: "", stage: "", priority: "NORMAL" });
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("pedidos-theme") as "dark" | "light") || "dark",
  );
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  useEffect(() => {
    let active = true;

    async function loadOrders() {
      setOrdersLoading(true);
      setOrdersError("");

      try {
        const data = await getOrders();

        const mappedOrders = await Promise.all(
          data.map(async (dbOrder) => {
            const mapped = mapDbOrder(dbOrder);
            const production = await getOrderProduction(dbOrder.id);
            const inspections = await getOrderInspections(dbOrder.id);
            const deliveries = await getOrderDeliveries(dbOrder.id);

            return {
              ...mapped,
              items: mapped.items.map((item) => {
                const savedProduction = production.find(
                  (entry) => entry.orderItemId === item.id,
                );

                const produced = savedProduction?.quantityProduced ?? 0;
                const savedInspections = inspections.filter((entry) => entry.orderItemId === item.id);
                const inspected = savedInspections.reduce((sum, entry) => sum + entry.quantityInspected, 0);
                const approved = savedInspections.reduce((sum, entry) => sum + entry.quantityApproved, 0);
                const inspectionsByBatch = Object.fromEntries(savedInspections
                  .filter((entry) => entry.batchId !== null)
                  .map((entry) => [entry.batchId!, entry.quantityInspected]));
                const savedDelivery = deliveries.find(
                  (entry) => entry.orderItemId === item.id,
                );

                const delivered = savedDelivery?.quantityDelivered ?? 0;

                return {
                  ...item,
                  produced,
                  inspected,
                  approved,
                  inspectionsByBatch,
                  delivered,
                  next:
                    produced < item.quantity
                      ? "Produzir saldo"
                      : inspected < produced
                        ? "Inspecionar saldo"
                        : delivered < approved
                          ? "Entregar saldo"
                          : "Concluído",
                };
              }),
            };
          }),
        );

        if (active) {
          setOrders(mappedOrders);
        }
      } catch (error) {
        if (active) {
          setOrdersError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os pedidos.",
          );
        }
      } finally {
        if (active) {
          setOrdersLoading(false);
        }
      }
    }

    void loadOrders();

    return () => {
      active = false;
    };
  }, []);
  const [page, setPage] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Order | null>(null);
  const [productionQuantity, setProductionQuantity] = useState("0");
  const [productionData, setProductionData] = useState<ItemProduction[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [newBatchNumber, setNewBatchNumber] = useState("");
  const [newBatchPlanned, setNewBatchPlanned] = useState("");
  const [newBatchNotes, setNewBatchNotes] = useState("");
  useEffect(() => {
    let active = true;
    if (!selected?.dbId) { setProductionData([]); return; }
    void getOrderProduction(selected.dbId).then((data) => { if (active) setProductionData(data); })
      .catch((error) => { if (active) setProductionError(error instanceof Error ? error.message : "Não foi possível carregar lotes."); });
    return () => { active = false; };
  }, [selected?.dbId]);
  useEffect(() => {
    if (!selectedBatchId && productionData.length) {
      const first = productionData.flatMap((production) => production.batches)[0];
      if (first) setSelectedBatchId(first.id);
    }
  }, [productionData, selectedBatchId]);
  const batchForItem = (orderItemId: string) => {
    const batches = productionData.find((p) => p.orderItemId === orderItemId)?.batches ?? [];
    return batches.find((batch) => batch.id === selectedBatchId && batch.status !== "CANCELLED")?.id ?? batches.find((batch) => batch.status !== "CANCELLED")?.id ?? "";
  };
  const batchInspectionTotals = (orderItemId: string, batchId: string) =>
    selected?.items.find((item) => item.id === orderItemId)?.inspectionsByBatch?.[batchId] ?? 0;
  const [inspectionQuantity, setInspectionQuantity] = useState("0");
  const [inspectionApproved, setInspectionApproved] = useState("0");
  const [inspectionRejected, setInspectionRejected] = useState("0");
  const [inspectionSaving, setInspectionSaving] = useState(false);
  const [inspectionError, setInspectionError] = useState("");
  const [inspectionSuccess, setInspectionSuccess] = useState("");
  const [productionSaving, setProductionSaving] = useState(false);
  const [productionError, setProductionError] = useState("");
  const [productionSuccess, setProductionSuccess] = useState("");
  const [deliveryQuantity, setDeliveryQuantity] = useState("0");
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [deliverySuccess, setDeliverySuccess] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [form, setForm] = useState({
    petrobras: "",
    delu: "",
    description: "",
    delivery: "",
    contract: "Sim",
    itemDescription: "",
    sku: "",
    quantity: "1",
  });
  const totals = useMemo(() => {
    const items = orders.flatMap((o) => o.items);
    return {
      orders: orders.length,
      active: orders.filter((o) => !o.delivered && !o.cancelled).length,
      late: orders.filter((o) => !o.cancelled).flatMap((o) => o.items).filter((i) => i.status === "Atrasado").length,
      delivered: orders.filter((o) => o.delivered && !o.cancelled).length,
      qty: orders.filter((o) => !o.cancelled).flatMap((o) => o.items).reduce((n, i) => n + i.quantity, 0),
      deliveredQty: orders.filter((o) => !o.cancelled).flatMap((o) => o.items).reduce((n, i) => n + i.delivered, 0),
    };
  }, [orders]);
  const visible = orders.filter(
    (o) =>
      (o.id + " " + o.petrobras + " " + o.delu + " " + o.description)
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "Todos" && !o.cancelled || filter === "Cancelados" && o.cancelled ||
        (filter === "Atrasados" &&
          o.items.some((i) => i.status === "Atrasado")) ||
        (filter === "Concluídos" && o.delivered && !o.cancelled) ||
        (filter === "Em andamento" && !o.delivered && !o.cancelled)),
  );
  const activeOrders = orders.filter((order) => !order.cancelled);
  const go = (p: string) => {
    setPage(p);
    setMobileNav(false);
    setSelected(null);
  };

  const createOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createOrderLock.current) return;
    createOrderLock.current = true;
    setCreatingOrder(true);
    setOrdersError("");

    try {
      await createOrderWithFirstItem({
        petrobras: form.petrobras,
        delu: form.delu,
        description: form.description,
        delivery: form.delivery,
        contract: form.contract === "Sim",
        itemDescription: form.itemDescription,
        sku: form.sku,
        quantity: Number(form.quantity),
        userId: profile.user_id,
      });

      const data = await getOrders();
      setOrders(data.map(mapDbOrder));

      setShowForm(false);
      setForm({
        petrobras: "",
        delu: "",
        description: "",
        delivery: "",
        contract: "Sim",
        itemDescription: "",
        sku: "",
        quantity: "1",
      });

      setPage("Pedidos");
    } catch (error) {
      setOrdersError(
        error instanceof Error
          ? error.message
          : "Não foi possível cadastrar o pedido.",
      );
    } finally {
      createOrderLock.current = false;
      setCreatingOrder(false);
    }
  };

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reportLock.current) return;
    reportLock.current = true;
    setReportSaving(true);
    setReportError("");
    try {
      await createProblemReport({ ...report, kind: report.kind as "BUG" | "QUESTION" | "SUGGESTION" | "IMPROVEMENT", priority: report.priority as "LOW" | "NORMAL" | "HIGH", userId: profile.user_id });
      setReportSuccess(true);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Não foi possível enviar o relato.");
    } finally {
      reportLock.current = false;
      setReportSaving(false);
    }
  };

  const nav = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Pedidos", icon: ClipboardList },
    { name: "Datasheet de itens", icon: FileSpreadsheet },
    { name: "Alertas", icon: Bell },
    { name: "Relatórios", icon: Activity },
  ];
  return (
    <div className={`app ${theme}`}>
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-icon">
            <Boxes size={23} />
          </div>
          <div>
            <b>
              Pedidos<span>PRO</span>
            </b>
            <small>CONTROLE OPERACIONAL</small>
          </div>
          <button
            className="icon-btn close-nav"
            onClick={() => setMobileNav(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace">
          <div className="workspace-avatar">OP</div>
          <div>
            <b>Operações</b>
            <small>Ambiente de trabalho</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">MENU PRINCIPAL</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.name}
              className={`nav-item ${page === n.name ? "active" : ""}`}
              onClick={() => go(n.name)}
            >
              <n.icon size={18} />
              <span>{n.name}</span>
              {n.name === "Alertas" && totals.late > 0 && (
                <em>{totals.late}</em>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label second">SISTEMA</div>
        <button
          className={`nav-item ${page === "Configurações" ? "active" : ""}`}
          onClick={() => go("Configurações")}
        >
          <Settings2 size={18} />
          <span>Configurações</span>
        </button>
        <div className="sidebar-bottom">
          <div className="secure">
            <ShieldCheck size={18} />
            <div>
              <b>Ambiente protegido</b>
              <small>Acesso autorizado</small>
            </div>
          </div>
          <div className="profile">
            <div className="avatar">
              {(profile.full_name || profile.role).slice(0, 2).toUpperCase()}
            </div>
            <div>
              <b>{profile.full_name || "Usuário"}</b>
              <small>
                {profile.role === "OWNER" ? "Proprietário" : "Administrador"}
              </small>
            </div>
            <button
              type="button"
              className="icon-btn"
              title="Sair da conta"
              aria-label="Sair da conta"
              onClick={() => void onLogout()}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="scrim"
          onClick={() => setMobileNav(false)}
          aria-label="Fechar menu"
        />
      )}
      <main className="main">
        <header className="topbar">
          <button
            className="icon-btn menu-btn"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            Workspace <span>/</span> <b>{page}</b>
          </div>
          <div className="top-actions">
            <button className="secondary-btn" onClick={() => { setReportOpen(true); setReportSuccess(false); setReportError(""); }}>
              <CircleHelp size={16} /> Relatar problema
            </button>
            <div className="system-status">
              <i /> Pedidos sincronizados
            </div>
            <button
              className="icon-btn theme-toggle"
              title="Alternar tema"
              onClick={() => {
                const t = theme === "dark" ? "light" : "dark";
                setTheme(t);
                localStorage.setItem("pedidos-theme", t);
              }}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="icon-btn"
              title="Alertas"
              onClick={() => go("Alertas")}
            >
              <Bell size={18} />
              {totals.late > 0 && <i className="notification-dot" />}
            </button>
            <div className="avatar small-avatar">GG</div>
          </div>
        </header>
        <div className="content">
          {ordersLoading && (
            <div className="setup-notice">
              Carregando pedidos do banco de dados...
            </div>
          )}

          {ordersError && (
            <div className="auth-error" role="alert">
              {ordersError}
            </div>
          )}

          {page === "Dashboard" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date()).toUpperCase()}
                  </div>
                  <h1>
                    Visão geral <span className="wave">✳</span>
                  </h1>
                  <p>
                    Acompanhe seus pedidos, identifique pendências e mantenha as
                    entregas no prazo.
                  </p>
                </div>
                <button
                  className="primary-btn"
                  onClick={() => setShowForm(true)}
                >
                  <Plus size={17} /> Novo pedido
                </button>
              </div>
              <div className="stats-grid">
                <Stat
                  icon={<ClipboardList />}
                  label="Total de pedidos"
                  value={totals.orders}
                  foot="Pedidos cadastrados"
                  color="blue"
                />
                <Stat
                  icon={<Clock3 />}
                  label="Em andamento"
                  value={totals.active}
                  foot="Pedidos não finalizados"
                  color="violet"
                />
                <Stat
                  icon={<AlertTriangle />}
                  label="Itens atrasados"
                  value={totals.late}
                  foot="Precisam de atenção"
                  color="red"
                />
                <Stat
                  icon={<CheckCircle2 />}
                  label="Entregues"
                  value={totals.delivered}
                  foot="Pedidos concluídos"
                  color="green"
                />
              </div>
              <div className="dashboard-grid">
                <section className="panel priority-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        <span className="heading-icon">
                          <CalendarClock size={18} />
                        </span>{" "}
                        Próximas ações
                      </h2>
                      <p>O que precisa de atenção agora</p>
                    </div>
                    <button className="text-btn" onClick={() => go("Alertas")}>
                      Ver todas <span>→</span>
                    </button>
                  </div>
                  <div className="priority-list">
                    {activeOrders
                      .flatMap((o) =>
                        o.items
                          .filter(
                            (i) =>
                              i.status === "Atrasado" ||
                              (!o.delivered && i.next !== "Concluído"),
                          )
                          .map((i) => ({ o, i })),
                      )
                      .slice(0, 4)
                      .map(({ o, i }) => (
                        <button
                          className="priority-row"
                          key={i.id}
                          onClick={() => {
                            setSelected(o);
                            setPage("Pedidos");
                          }}
                        >
                          <div
                            className={`priority-icon ${i.status === "Atrasado" ? "red" : "blue"}`}
                          >
                            {i.status === "Atrasado" ? (
                              <AlertTriangle size={17} />
                            ) : (
                              <Clock3 size={17} />
                            )}
                          </div>
                          <div className="priority-info">
                            <b>{i.next}</b>
                            <span>
                              {o.id} · {i.description}
                            </span>
                          </div>
                          <div className="priority-due">
                            <b
                              className={
                                i.status === "Atrasado" ? "red-text" : ""
                              }
                            >
                              {moneyDate(i.due)}
                            </b>
                            <span>
                              {i.status === "Atrasado"
                                ? "Prazo vencido"
                                : "Prazo previsto"}
                            </span>
                          </div>
                          <ChevronDown className="row-arrow" size={16} />
                        </button>
                      ))}
                    {activeOrders.every((o) => o.delivered) && (
                      <div className="empty-state">
                        Nenhuma pendência ativa.
                      </div>
                    )}
                  </div>
                </section>
                <section className="panel delivery-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        <span className="heading-icon">
                          <Truck size={18} />
                        </span>{" "}
                        Entregas e produção
                      </h2>
                      <p>Visão consolidada das quantidades</p>
                    </div>
                    <button
                      className="icon-btn"
                      onClick={() => go("Datasheet de itens")}
                    >
                      <ArrowDownToLine size={17} />
                    </button>
                  </div>
                  <div className="delivery-total">
                    <div>
                      <span>Unidades entregues</span>
                      <h3>
                        {totals.deliveredQty}
                        <small> / {totals.qty}</small>
                      </h3>
                    </div>
                    <div className="percent">
                      {totals.qty
                        ? Math.round((totals.deliveredQty / totals.qty) * 100)
                        : 0}
                      %
                    </div>
                  </div>
                  <div className="progress-track">
                    <div
                      style={{
                        width: `${totals.qty ? (totals.deliveredQty / totals.qty) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <div className="legend">
                    <span>
                      <i className="dot blue-dot" /> Entregues
                    </span>
                    <span>
                      <i className="dot gray-dot" /> Saldo a entregar
                    </span>
                  </div>
                  <div className="mini-divider" />
                  <div className="stage-summary">
                    <div>
                      <span>Pedidos com SI solicitada</span>
                      <b>{activeOrders.filter((o) => o.si).length}</b>
                    </div>
                    <div>
                      <span>Aguardando dispensa PIM</span>
                      <b>
                        {
                          activeOrders.filter((o) => o.pimResult === "Aguardando")
                            .length
                        }
                      </b>
                    </div>
                    <div>
                      <span>Aguardando NF</span>
                      <b>
                        {activeOrders.filter((o) => !o.nf && !o.delivered).length}
                      </b>
                    </div>
                  </div>
                </section>
              </div>
              <section className="panel recent-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Pedidos recentes</h2>
                    <p>Resumo dos últimos pedidos atualizados</p>
                  </div>
                  <button className="text-btn" onClick={() => go("Pedidos")}>
                    Ver todos <span>→</span>
                  </button>
                </div>
                <OrdersTable
                  orders={activeOrders.slice(0, 4)}
                  onOpen={(o) => {
                    setSelected(o);
                    setPage("Pedidos");
                  }}
                />
              </section>
            </>
          )}
          {page === "Pedidos" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">GESTÃO OPERACIONAL</div>
                  <h1>Pedidos</h1>
                  <p>Gerencie pedidos, itens, etapas e entregas parciais.</p>
                </div>
                <button
                  className="primary-btn"
                  onClick={() => setShowForm(true)}
                >
                  <Plus size={17} /> Novo pedido
                </button>
              </div>
              <section className="panel table-panel">
                <div className="table-toolbar">
                  <div className="search-box">
                    <Search size={17} />
                    <input
                      placeholder="Buscar pedido, Petrobras, DELU..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <div className="toolbar-right">
                    <div className="select-wrap">
                      <Filter size={15} />
                      <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option>Todos</option>
                        <option>Cancelados</option>
                        <option>Em andamento</option>
                        <option>Atrasados</option>
                        <option>Concluídos</option>
                      </select>
                    </div>
                    <button
                      className="secondary-btn"
                      onClick={() => downloadCSV(visible)}
                    >
                      <ArrowDownToLine size={16} /> Exportar
                    </button>
                  </div>
                </div>
                <OrdersTable orders={visible} onOpen={(o) => setSelected(o)} />
              </section>
            </>
          )}
          {page === "Datasheet de itens" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">CONTROLE DETALHADO</div>
                  <h1>Datasheet de itens</h1>
                  <p>
                    Acompanhe quantidades contratadas, produzidas, inspecionadas
                    e entregues.
                  </p>
                </div>
                <button
                  className="secondary-btn"
                  onClick={() => downloadItemsCSV(orders)}
                >
                  <ArrowDownToLine size={16} /> Exportar itens
                </button>
              </div>
              <section className="panel table-panel">
                <div className="table-toolbar">
                  <div className="search-box">
                    <Search size={17} />
                    <input
                      placeholder="Buscar item, SKU ou pedido..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <span className="result-count">
                    {activeOrders.flatMap((o) => o.items).length} itens cadastrados
                  </span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Pedido / item</th>
                        <th>Descrição</th>
                        <th>Contratada</th>
                        <th>Produzida</th>
                        <th>Inspecionada</th>
                        <th>Aprovada</th>
                        <th>Entregue</th>
                        <th>Saldo</th>
                        <th>Próxima etapa</th>
                        <th>Prazo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeOrders.flatMap((o) =>
                        o.items
                          .filter((i) =>
                            (o.id + " " + i.description + " " + i.sku)
                              .toLowerCase()
                              .includes(query.toLowerCase()),
                          )
                          .map((i) => (
                            <tr key={i.id}>
                              <td>
                                <b>{o.id}</b>
                                <small>{i.sku}</small>
                              </td>
                              <td>{i.description}</td>
                              <td>{i.quantity}</td>
                              <td>{i.produced}</td>
                              <td>{i.inspected}</td>
                              <td>{i.approved}</td>
                              <td>{i.delivered}</td>
                              <td>
                                <b>{i.quantity - i.delivered}</b>
                              </td>
                              <td>
                                <span
                                  className={`stage-label ${i.status === "Atrasado" ? "late" : ""}`}
                                >
                                  {i.next}
                                </span>
                              </td>
                              <td>{moneyDate(i.due)}</td>
                            </tr>
                          )),
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {page === "Alertas" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">CENTRAL DE NOTIFICAÇÕES</div>
                  <h1>Alertas e pendências</h1>
                  <p>
                    Priorize ações por prazo e acompanhe etapas que dependem de
                    terceiros.
                  </p>
                </div>
              </div>
              <div className="stats-grid alert-stats">
                <Stat
                  icon={<AlertTriangle />}
                  label="Atrasados"
                  value={totals.late}
                  foot="Etapas fora do prazo"
                  color="red"
                />
                <Stat
                  icon={<Clock3 />}
                  label="Próximas ações"
                  value={
                    activeOrders
                      .flatMap((o) => o.items)
                      .filter((i) => i.status !== "Entregue").length
                  }
                  foot="Itens em andamento"
                  color="blue"
                />
                <Stat
                  icon={<CircleHelp />}
                  label="Aguardando retorno"
                  value={
                    activeOrders.filter((o) => o.pimResult === "Aguardando").length
                  }
                  foot="Dispensas de PIM"
                  color="violet"
                />
              </div>
              <section className="panel priority-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Fila de ações</h2>
                    <p>Ordenada por prioridade e prazo</p>
                  </div>
                </div>
                {orders
                  .flatMap((o) =>
                    o.items
                      .filter(
                        (i) =>
                          i.status === "Atrasado" ||
                          i.status === "Em andamento",
                      )
                      .map((i) => ({ o, i })),
                  )
                  .sort(
                    (a, b) =>
                      (a.i.status === "Atrasado" ? -1 : 1) -
                      (b.i.status === "Atrasado" ? -1 : 1),
                  )
                  .map(({ o, i }) => (
                    <button
                      className="priority-row"
                      key={i.id}
                      onClick={() => setSelected(o)}
                    >
                      <div
                        className={`priority-icon ${i.status === "Atrasado" ? "red" : "blue"}`}
                      >
                        {i.status === "Atrasado" ? (
                          <AlertTriangle size={17} />
                        ) : (
                          <CalendarClock size={17} />
                        )}
                      </div>
                      <div className="priority-info">
                        <b>{i.next}</b>
                        <span>
                          {o.id} · {i.description}
                        </span>
                      </div>
                      <div className="priority-due">
                        <b
                          className={i.status === "Atrasado" ? "red-text" : ""}
                        >
                          {moneyDate(i.due)}
                        </b>
                        <span>
                          {i.status === "Atrasado"
                            ? "Atrasado"
                            : "Em andamento"}
                        </span>
                      </div>
                      <ChevronDown size={16} />
                    </button>
                  ))}
              </section>
            </>
          )}
          {page === "Relatórios" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">ANÁLISE OPERACIONAL</div>
                  <h1>Relatórios</h1>
                  <p>Indicadores consolidados de pedidos, itens e entregas.</p>
                </div>
                <button
                  className="secondary-btn"
                  onClick={() => downloadCSV(orders)}
                >
                  <ArrowDownToLine size={16} /> Exportar pedidos
                </button>
              </div>
              <div className="stats-grid">
                <Stat
                  icon={<Boxes />}
                  label="Unidades contratadas"
                  value={totals.qty}
                  foot="Somatório de todos os itens"
                  color="blue"
                />
                <Stat
                  icon={<CheckCircle2 />}
                  label="Unidades entregues"
                  value={totals.deliveredQty}
                  foot="Quantidade registrada"
                  color="green"
                />
                <Stat
                  icon={<Activity />}
                  label="Taxa de entrega"
                  value={`${totals.qty ? Math.round((totals.deliveredQty / totals.qty) * 100) : 0}%`}
                  foot="Entregue / contratada"
                  color="violet"
                />
                <Stat
                  icon={<AlertTriangle />}
                  label="Itens atrasados"
                  value={totals.late}
                  foot="Exigem acompanhamento"
                  color="red"
                />
              </div>
              <section className="panel recent-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Resumo por pedido</h2>
                    <p>Exportação disponível para análise no Excel</p>
                  </div>
                </div>
                <OrdersTable orders={activeOrders} onOpen={(o) => setSelected(o)} />
              </section>
            </>
          )}
          {page === "Configurações" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">PREFERÊNCIAS</div>
                  <h1>Configurações</h1>
                  <p>
                    Personalize a aparência e prepare a conexão com o banco.
                  </p>
                </div>
              </div>
              <section className="panel settings-panel">
                <h2>Aparência</h2>
                <p>
                  Escolha o tema que prefere usar. A escolha fica salva neste
                  navegador.
                </p>
                <div className="theme-options">
                  <button
                    className={`theme-option ${theme === "light" ? "selected" : ""}`}
                    onClick={() => {
                      setTheme("light");
                      localStorage.setItem("pedidos-theme", "light");
                    }}
                  >
                    <Sun />
                    <b>Tema claro</b>
                    <span>Branco, cinza e azul</span>
                  </button>
                  <button
                    className={`theme-option ${theme === "dark" ? "selected" : ""}`}
                    onClick={() => {
                      setTheme("dark");
                      localStorage.setItem("pedidos-theme", "dark");
                    }}
                  >
                    <Moon />
                    <b>Tema escuro</b>
                    <span>Grafite, preto e azul</span>
                  </button>
                </div>
                <div className="setup-notice">
                  <ShieldCheck />
                  <div>
                    <b>Próxima etapa técnica</b>
                    <p>
                      O acesso usa Supabase Auth. Confirme as políticas RLS e
                      as migrações do banco antes de habilitar novos fluxos.
                    </p>
                  </div>
                </div>
                <p className="muted-text">
                  Os pedidos são carregados da sua conta e do banco de dados.
                </p>
              </section>
            </>
          )}
          <footer>
            <span>
              Pedidos PRO <b>·</b> Operação comercial
            </span>
            <span>
              <i /> Dados operacionais carregados do Supabase
            </span>
          </footer>
        </div>
      </main>
      {showForm && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowForm(false);
          }}
        >
          <form className="modal" onSubmit={createOrder}>
            <div className="modal-heading">
              <div>
                <div className="eyebrow">NOVO REGISTRO</div>
                <h2>Cadastrar pedido</h2>
                <p>Informe o pedido e cadastre pelo menos um item.</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowForm(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="form-section-title">Identificação do pedido</div>
            <div className="form-grid">
              <Field label="Pedido Petrobras *">
                <input
                  required
                  value={form.petrobras}
                  onChange={(e) =>
                    setForm({ ...form, petrobras: e.target.value })
                  }
                  placeholder="Ex.: 4500129876"
                />
              </Field>
              <Field label="Pedido DELU *">
                <input
                  required
                  value={form.delu}
                  onChange={(e) => setForm({ ...form, delu: e.target.value })}
                  placeholder="Ex.: DL-8831"
                />
              </Field>
              <Field label="É contrato?">
                <select
                  value={form.contract}
                  onChange={(e) =>
                    setForm({ ...form, contract: e.target.value })
                  }
                >
                  <option>Sim</option>
                  <option>Não</option>
                </select>
              </Field>
              <Field label="Data prevista de entrega *">
                <input
                  required
                  type="date"
                  value={form.delivery}
                  onChange={(e) =>
                    setForm({ ...form, delivery: e.target.value })
                  }
                />
              </Field>
              <div className="field full">
                <label>Descrição geral *</label>
                <input
                  required
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Descrição do pedido"
                />
              </div>
            </div>
            <div className="form-section-title">Primeiro item</div>
            <div className="form-grid">
              <Field label="Descrição do item *">
                <input
                  required
                  value={form.itemDescription}
                  onChange={(e) =>
                    setForm({ ...form, itemDescription: e.target.value })
                  }
                  placeholder="Nome do produto"
                />
              </Field>
              <Field label="Código / SKU">
                <input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="Código do item"
                />
              </Field>
              <Field label="Quantidade contratada *">
                <input
                  required
                  type="number"
                  min="1"
                  step="any"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </button>
              <button className="primary-btn" type="submit" disabled={creatingOrder}>
                <Check size={17} /> {creatingOrder ? "Salvando..." : "Criar pedido"}
              </button>
            </div>
          </form>
        </div>
      )}
      {reportOpen && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={submitReport}>
            <div className="modal-heading"><div><div className="eyebrow">AJUDA E MELHORIAS</div><h2>Relatar problema</h2><p>Não inclua senhas, tokens ou dados confidenciais de pedidos.</p></div>
              <button type="button" className="icon-btn" aria-label="Fechar" onClick={() => setReportOpen(false)}><X size={18} /></button>
            </div>
            {reportSuccess ? <div role="status" className="form-success">Relato enviado e confirmado pelo banco de dados.</div> : <>
              <div className="form-grid">
                <Field label="Tipo"><select value={report.kind} onChange={e => setReport({...report, kind:e.target.value})}><option value="BUG">Bug</option><option value="QUESTION">Dúvida</option><option value="SUGGESTION">Sugestão</option><option value="IMPROVEMENT">Melhoria</option></select></Field>
                <Field label="Prioridade"><select value={report.priority} onChange={e => setReport({...report, priority:e.target.value})}><option value="LOW">Baixa</option><option value="NORMAL">Normal</option><option value="HIGH">Alta</option></select></Field>
                <div className="field full"><label htmlFor="report-title">Título resumido</label><input id="report-title" required maxLength={160} value={report.title} onChange={e => setReport({...report, title:e.target.value})} /></div>
                <div className="field full"><label htmlFor="report-description">O que aconteceu?</label><textarea id="report-description" required minLength={5} maxLength={10000} rows={4} value={report.description} onChange={e => setReport({...report, description:e.target.value})} /></div>
                <div className="field full"><label htmlFor="report-expected">O que esperava que acontecesse?</label><textarea id="report-expected" maxLength={5000} rows={3} value={report.expected} onChange={e => setReport({...report, expected:e.target.value})} /></div>
                <div className="field full"><label htmlFor="report-stage">Etapa do sistema</label><input id="report-stage" maxLength={120} placeholder={page} value={report.stage} onChange={e => setReport({...report, stage:e.target.value})} /></div>
              </div>
              {reportError && <p role="alert" className="form-error">{reportError}</p>}
              <div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setReportOpen(false)}>Cancelar</button><button className="primary-btn" type="submit" disabled={reportSaving}>{reportSaving ? "Enviando..." : "Enviar relato"}</button></div>
            </>}
          </form>
        </div>
      )}
      {selected && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div className="modal detail-modal">
            <div className="modal-heading">
              <div>
                <div className="eyebrow">DETALHES DO PEDIDO</div>
                <h2>{selected.id}</h2>
                <p>
                  Petrobras {selected.petrobras} · DELU {selected.delu}
                </p>
              </div>
              <button className="icon-btn" onClick={() => setSelected(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="detail-summary">
              <div>
                <span>Descrição</span>
                <b>{selected.description}</b>
              </div>
              <div>
                <span>Entrega prevista</span>
                <b>{moneyDate(selected.delivery)}</b>
              </div>
              <div>
                <span>Contrato</span>
                <b>{selected.contract ? "Sim" : "Não"}</b>
              </div>
            </div>
            <div className="form-section-title">Itens e progresso</div>
            {selected.items.map((item) => (
              <div className="detail-item" key={item.id}>
                <div className="detail-item-top">
                  <div>
                    <b>{item.description}</b>
                    <small>{item.sku || item.id}</small>
                  </div>
                  <span
                    className={`status-pill ${item.status === "Atrasado" ? "danger" : item.status === "Entregue" ? "success" : "info"}`}
                  >
                    {item.status}
                  </span>
                </div>
                <div className="item-metrics">
                  <span>
                    Contratada <b>{item.quantity}</b>
                  </span>
                  <span>
                    Produzida <b>{item.produced}</b>
                  </span>
                  <span>
                    Aprovada <b>{item.approved}</b>
                  </span>
                  <span>
                    Entregue <b>{item.delivered}</b>
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    style={{
                      width: `${item.quantity ? (item.delivered / item.quantity) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="detail-next">
                  <CalendarClock size={16} />
                  <span>
                    Próxima etapa: <b>{item.next}</b>
                  </span>
                </div>
                {(() => {
                  const production = productionData.find((p) => p.orderItemId === item.id);
                  const batches = production?.batches ?? [];
                  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId && batch.order_item_id === item.id && batch.status !== "CANCELLED") ?? batches.find((batch) => batch.status !== "CANCELLED");
                  return <>
                    <div className="form-grid compact-grid">
                      <Field label="Lote para produção e inspeção">
                        <select value={selectedBatch?.id ?? ""} onChange={(e) => setSelectedBatchId(e.target.value)}>
                          <option value="">Selecione um lote</option>
                          {batches.map((batch) => <option key={batch.id} value={batch.id} disabled={batch.status === "CANCELLED"}>{batch.batch_number} · planejado {batch.quantity_planned} · produzido {batch.quantity_produced} · saldo {batch.balance}{batch.status === "CANCELLED" ? " · cancelado" : ""}</option>)}
                        </select>
                      </Field>
                      <Field label="Novo lote · número">
                        <input value={newBatchNumber} onChange={(e) => setNewBatchNumber(e.target.value)} placeholder={`LOTE-${batches.length + 1}`} />
                      </Field>
                      <Field label="Novo lote · quantidade planejada">
                        <input type="number" min="1" step="1" value={newBatchPlanned} onChange={(e) => setNewBatchPlanned(e.target.value)} />
                      </Field>
                      <Field label="Observações do lote">
                        <input value={newBatchNotes} onChange={(e) => setNewBatchNotes(e.target.value)} />
                      </Field>
                      <div className="production-register"><button type="button" className="secondary-btn" disabled={!newBatchNumber.trim() || !Number.isSafeInteger(Number(newBatchPlanned)) || Number(newBatchPlanned) <= 0 || Number(newBatchPlanned) > Math.max(0, item.quantity - (production?.batches.filter((batch) => batch.status !== "CANCELLED").reduce((sum, batch) => sum + batch.quantity_planned, 0) ?? 0))} onClick={async () => {
                        try {
                          const id = await createProductionBatch({ orderItemId: item.id, batchNumber: newBatchNumber, quantityPlanned: Number(newBatchPlanned), notes: newBatchNotes });
                          const refreshed = await getOrderProduction(selected.dbId!);
                          setProductionData(refreshed); setSelectedBatchId(id); setNewBatchNumber(""); setNewBatchPlanned(""); setNewBatchNotes(""); setProductionError("");
                        } catch (error) { setProductionError(error instanceof Error ? error.message : "Não foi possível criar o lote."); }
                      }}>Criar lote</button></div>
                    </div>
                    {batches.map((batch) => <div className="detail-next" key={batch.id}><Package size={16} /><span><b>{batch.batch_number}</b> · planejado {batch.quantity_planned}, produzido {batch.quantity_produced}, saldo {batch.balance} · {batch.status}{batch.completion_date ? ` · concluído ${moneyDate(batch.completion_date)}` : ""}{batch.notes ? ` · ${batch.notes}` : ""}</span></div>)}
                    <Field label="Nova quantidade produzida">
                      <input type="number" min="1" max={selectedBatch?.balance ?? 0} step="1" value={productionQuantity} onChange={(e) => { setProductionQuantity(e.target.value); setProductionError(""); setProductionSuccess(""); }} />
                    </Field>
                  </>;
                })()}
                <div className="form-grid compact-grid">
                  <div className="production-register">
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={
                        productionSaving ||
                        !Number.isFinite(Number(productionQuantity)) ||
                        Number(productionQuantity) <= 0 ||
                        !batchForItem(item.id) ||
                        Number(productionQuantity) > Math.min(productionData.find((p) => p.orderItemId === item.id)?.batches.find((b) => b.id === batchForItem(item.id))?.balance ?? 0, Math.max(0, item.quantity - item.produced))
                      }
                      onClick={async () => {
                        if (productionLock.current) return;
                        if (!selected?.dbId) {
                          setProductionError(
                            "Não foi possível identificar o pedido no banco.",
                          );
                          return;
                        }

                        productionLock.current = true;
                        setProductionSaving(true);
                        setProductionError("");
                        setProductionSuccess("");

                        try {
                          await registerProduction({
                            orderItemId: item.id,
                            batchId: batchForItem(item.id),
                            quantityProduced: Number(productionQuantity),
                            userId: profile.user_id,
                          });

                          const production = await getOrderProduction(
                            selected.dbId,
                          );
                          setProductionData(production);
                          const saved = production.find(
                            (entry) => entry.orderItemId === item.id,
                          );
                          const produced = saved?.quantityProduced ?? 0;

                          const updated: Order = {
                            ...selected,
                            items: selected.items.map((current) =>
                              current.id === item.id
                                ? {
                                    ...current,
                                    produced,
                                    next:
                                      produced < current.quantity
                                        ? "Produzir saldo"
                                        : current.inspected < produced
                                          ? "Inspecionar saldo"
                                          : current.delivered < produced
                                            ? "Entregar saldo"
                                            : "Concluído",
                                  }
                                : current,
                            ),
                          };

                          setSelected(updated);
                          setOrders((current) =>
                            current.map((order) =>
                              order.id === updated.id ? updated : order,
                            ),
                          );

                          setProductionQuantity("0");
                          setProductionSuccess(
                            "Produção registrada com sucesso.",
                          );
                        } catch (error) {
                          setProductionError(
                            error instanceof Error
                              ? error.message
                              : "Não foi possível registrar a produção.",
                          );
                        } finally {
                          productionLock.current = false;
                          setProductionSaving(false);
                        }
                      }}
                    >
                      {productionSaving
                        ? "Registrando..."
                        : "Registrar produção"}
                    </button>

                    {productionError && (
                      <p role="alert" className="form-error">
                        {productionError}
                      </p>
                    )}

                    {productionSuccess && (
                      <p className="form-success">{productionSuccess}</p>
                    )}
                  </div>

                  <Field label="Nova quantidade inspecionada">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      max={Math.max(0, (productionData.find((p) => p.orderItemId === item.id)?.batches.find((batch) => batch.id === batchForItem(item.id))?.quantity_produced ?? 0) - batchInspectionTotals(item.id, batchForItem(item.id)))}
                      value={inspectionQuantity}
                      onChange={(e) => {
                        setInspectionQuantity(e.target.value);
                        setInspectionError("");
                        setInspectionSuccess("");
                      }}
                    />
                  </Field>
                  <Field label="Aprovada nesta inspeção">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      max={Number(inspectionQuantity) || 0}
                      value={inspectionApproved}
                      onChange={(e) => {
                        setInspectionApproved(e.target.value);
                        setInspectionError("");
                        setInspectionSuccess("");
                      }}
                    />
                  </Field>
                  <Field label="Rejeitada nesta inspeção">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      max={Number(inspectionQuantity) || 0}
                      value={inspectionRejected}
                      onChange={(e) => {
                        setInspectionRejected(e.target.value);
                        setInspectionError("");
                        setInspectionSuccess("");
                      }}
                    />
                  </Field>
                  <div className="production-register">
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={
                        inspectionSaving ||
                        !selected?.dbId ||
                        !Number.isFinite(Number(inspectionQuantity)) ||
                        Number(inspectionQuantity) <= 0 ||
                        !batchForItem(item.id) ||
                        Number(inspectionQuantity) > Math.max(0, (productionData.find((p) => p.orderItemId === item.id)?.batches.find((batch) => batch.id === batchForItem(item.id))?.quantity_produced ?? 0) - batchInspectionTotals(item.id, batchForItem(item.id))) ||
                        Number(inspectionApproved) < 0 ||
                        Number(inspectionRejected) < 0 ||
                        Number(inspectionApproved) +
                          Number(inspectionRejected) !==
                          Number(inspectionQuantity)
                      }
                      onClick={async () => {
                        if (inspectionLock.current) return;
                        if (!selected?.dbId) {
                          setInspectionError(
                            "Não foi possível identificar o pedido.",
                          );
                          return;
                        }

                        inspectionLock.current = true;
                        setInspectionSaving(true);
                        setInspectionError("");
                        setInspectionSuccess("");

                        try {
                          await registerInspection({
                            orderId: selected.dbId,
                            orderItemId: item.id,
                            batchId: batchForItem(item.id),
                            quantityInspected: Number(inspectionQuantity),
                            quantityApproved: Number(inspectionApproved),
                            quantityRejected: Number(inspectionRejected),
                            userId: profile.user_id,
                          });

                          const inspections = await getOrderInspections(
                            selected.dbId,
                          );
                          const saved = inspections.filter((entry) => entry.orderItemId === item.id);
                          const inspected = saved.reduce((sum, entry) => sum + entry.quantityInspected, 0);
                          const approved = saved.reduce((sum, entry) => sum + entry.quantityApproved, 0);
                          const inspectionsByBatch = Object.fromEntries(saved.filter((entry) => entry.batchId !== null).map((entry) => [entry.batchId!, entry.quantityInspected]));

                          const updated: Order = {
                            ...selected,
                            items: selected.items.map((current) =>
                              current.id === item.id
                                ? {
                                    ...current,
                                    inspected,
                                    approved,
                                    inspectionsByBatch,
                                    next:
                                      inspected < current.produced
                                        ? "Inspecionar saldo"
                                        : approved < inspected
                                          ? "Resolver inspeção"
                                          : current.delivered < approved
                                            ? "Entregar saldo"
                                            : "Concluído",
                                  }
                                : current,
                            ),
                          };

                          setSelected(updated);
                          setOrders((current) =>
                            current.map((order) =>
                              order.id === updated.id ? updated : order,
                            ),
                          );

                          setInspectionQuantity("0");
                          setInspectionApproved("0");
                          setInspectionRejected("0");
                          setInspectionSuccess(
                            "Inspeção registrada com sucesso.",
                          );
                        } catch (error) {
                          setInspectionError(
                            error instanceof Error
                              ? error.message
                              : "Não foi possível registrar a inspeção.",
                          );
                        } finally {
                          inspectionLock.current = false;
                          setInspectionSaving(false);
                        }
                      }}
                    >
                      {inspectionSaving
                        ? "Registrando..."
                        : "Registrar inspeção"}
                    </button>

                    {inspectionError && (
                      <p role="alert" className="form-error">
                        {inspectionError}
                      </p>
                    )}

                    {inspectionSuccess && (
                      <p className="form-success">{inspectionSuccess}</p>
                    )}
                  </div>
                  <Field label="Total aprovado">
                    <output aria-live="polite">{item.approved}</output>
                  </Field>

                  <Field label="Nova quantidade a entregar">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      max={Math.max(0, item.approved - item.delivered)}
                      value={deliveryQuantity}
                      onChange={(e) => {
                        setDeliveryQuantity(e.target.value);
                        setDeliveryError("");
                        setDeliverySuccess("");
                      }}
                    />
                  </Field>

                  <div className="production-register">
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={
                        deliverySaving ||
                        !selected?.dbId ||
                        !Number.isSafeInteger(Number(deliveryQuantity)) ||
                        Number(deliveryQuantity) <= 0 ||
                        Number(deliveryQuantity) >
                          item.approved - item.delivered
                      }
                      onClick={async () => {
                        if (deliveryLock.current) return;
                        if (!selected?.dbId) {
                          setDeliveryError(
                            "Não foi possível identificar o pedido.",
                          );
                          return;
                        }

                        deliveryLock.current = true;
                        setDeliverySaving(true);
                        setDeliveryError("");
                        setDeliverySuccess("");

                        try {
                          await registerDelivery({
                            orderId: selected.dbId,
                            orderItemId: item.id,
                            quantity: Number(deliveryQuantity),
                            userId: profile.user_id,
                          });

                          const deliveries = await getOrderDeliveries(
                            selected.dbId,
                          );
                          const saved = deliveries.find(
                            (entry) => entry.orderItemId === item.id,
                          );
                          const delivered = saved?.quantityDelivered ?? 0;

                          const updated: Order = {
                            ...selected,
                            items: selected.items.map((current) =>
                              current.id === item.id
                                ? {
                                    ...current,
                                    delivered,
                                    next:
                                      delivered < current.approved
                                        ? "Entregar saldo"
                                        : "Concluído",
                                    status:
                                      delivered >= current.quantity
                                        ? "Entregue"
                                        : current.status === "Atrasado"
                                          ? "Atrasado"
                                          : "Em andamento",
                                  }
                                : current,
                            ),
                            delivered: selected.items.every((current) =>
                              current.id === item.id
                                ? delivered >= current.quantity
                                : current.delivered >= current.quantity,
                            ),
                          };

                          setSelected(updated);
                          setOrders((current) =>
                            current.map((order) =>
                              order.id === updated.id ? updated : order,
                            ),
                          );

                          setDeliveryQuantity("0");
                          setDeliverySuccess("Entrega registrada com sucesso.");
                        } catch (error) {
                          setDeliveryError(
                            error instanceof Error
                              ? error.message
                              : "Não foi possível registrar a entrega.",
                          );
                        } finally {
                          deliveryLock.current = false;
                          setDeliverySaving(false);
                        }
                      }}
                    >
                      {deliverySaving ? "Registrando..." : "Registrar entrega"}
                    </button>

                    {deliveryError && (
                      <p role="alert" className="form-error">
                        {deliveryError}
                      </p>
                    )}

                    {deliverySuccess && (
                      <p className="form-success">{deliverySuccess}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div className="modal-actions">
              <button
                type="button"
                className="danger-btn"
                disabled={selected.cancelled}
                onClick={() => { setActionError(""); setCancelReason(""); setActionModal("cancel"); }}
              >Cancelar pedido</button>
              <button
                type="button"
                className="danger-btn"
                onClick={() => { setActionError(""); setActionModal("delete"); }}
              ><Trash2 size={16} /> Excluir pedido</button>
              <button
                className="secondary-btn"
                onClick={() => setSelected(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {selected && actionModal && (
        <div className="modal-backdrop action-modal-layer" role="presentation">
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="order-action-title"
            onSubmit={async (event) => {
              event.preventDefault();
              if (destructiveLock.current || !selected.dbId) return;
              destructiveLock.current = true;
              setActionSaving(true);
              setActionError("");
              try {
                if (actionModal === "cancel") {
                  if (!selected.dbStatus) throw new Error("Não foi possível identificar o status atual no banco.");
                  await cancelOrder({ orderId: selected.dbId, currentStatus: selected.dbStatus, reason: cancelReason });
                  const cancelled = { ...selected, cancelled: true, dbStatus: "CANCELLED" };
                  setOrders((current) => current.map((order) => order.dbId === cancelled.dbId ? cancelled : order));
                  setSelected(cancelled);
                } else {
                  // O banco/RPC valida dependências de forma atômica; falha fechada se não houver implementação.
                  await deleteOrderSafely(selected.dbId);
                  setOrders((current) => current.filter((order) => order.dbId !== selected.dbId));
                  setSelected(null);
                }
                setActionModal(null);
              } catch (error) {
                setActionError(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
              } finally {
                destructiveLock.current = false;
                setActionSaving(false);
              }
            }}>
            <div className="modal-heading"><div><div className="eyebrow">{actionModal === "cancel" ? "CANCELAMENTO" : "EXCLUSÃO SEGURA"}</div><h2 id="order-action-title">{actionModal === "cancel" ? "Cancelar pedido" : "Excluir pedido"}</h2></div>
              <button type="button" className="icon-btn" aria-label="Fechar" disabled={actionSaving} onClick={() => setActionModal(null)}><X size={18} /></button>
            </div>
            <p>Pedido <b>{selected.id}</b></p>
            {actionModal === "delete" ? (
              <div className="form-error">A exclusão é permanente. Pedidos com produção, inspeções, entregas ou outros históricos devem ser cancelados. A operação só será aceita pelo banco se a RPC transacional validar permissões e dependências.</div>
            ) : <>
              <div className="field"><label htmlFor="cancel-reason">Motivo do cancelamento</label><textarea id="cancel-reason" required minLength={3} maxLength={2000} rows={4} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></div>
              {selected.items.some((item) => item.delivered > 0) && <p className="form-error">Este pedido tem entregas realizadas. O cancelamento não desfaz a entrega física e não altera os registros históricos.</p>}
            </>}
            {actionError && <p role="alert" className="form-error">{actionError}</p>}
            <div className="modal-actions">
              <button type="button" className="secondary-btn" disabled={actionSaving} onClick={() => setActionModal(null)}>Voltar</button>
              <button type="submit" className="danger-btn" disabled={actionSaving || (actionModal === "cancel" && !cancelReason.trim())}>
                {actionSaving ? "Processando..." : actionModal === "cancel" ? "Confirmar cancelamento" : "Confirmar exclusão"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
function MoreIcon() {
  return <Settings2 size={16} className="muted-icon" />;
}
function Stat({
  icon,
  label,
  value,
  foot,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  foot: string;
  color: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <div className={`stat-icon ${color}`}>{icon}</div>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">
        <span className={`stat-bullet ${color}`} />
        {foot}
      </div>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
function OrdersTable({
  orders,
  onOpen,
}: {
  orders: Order[];
  onOpen: (o: Order) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Pedido / contrato</th>
            <th>Pedido DELU</th>
            <th>Descrição</th>
            <th>Itens</th>
            <th>Entrega prevista</th>
            <th>Próxima etapa</th>
            <th>Situação</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const first =
              o.items.find((i) => i.status !== "Entregue") || o.items[0];
            return (
              <tr
                key={o.id}
                onClick={() => onOpen(o)}
                className="clickable-row"
              >
                <td>
                  <b>{o.id}</b>
                  <small>Petrobras: {o.petrobras}</small>
                </td>
                <td>{o.delu}</td>
                <td className="description-cell">{o.description}</td>
                <td>
                  <span className="item-count">
                    <Package size={14} />
                    {o.items.length} {o.items.length === 1 ? "item" : "itens"}
                  </span>
                </td>
                <td>{moneyDate(o.delivery)}</td>
                <td>
                  <span
                    className={`stage-label ${first?.status === "Atrasado" ? "late" : ""}`}
                  >
                    {o.delivered ? "Concluído" : first?.next || "—"}
                  </span>
                </td>
                <td>
                  <span
                    className={`status-pill ${o.delivered ? "success" : o.items.some((i) => i.status === "Atrasado") ? "danger" : "info"}`}
                  >
                    <i />
                    {o.delivered
                      ? "Entregue"
                      : o.items.some((i) => i.status === "Atrasado")
                        ? "Atrasado"
                        : "Em andamento"}
                  </span>
                </td>
                <td>
                  <button
                    className="icon-btn tiny"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(o);
                    }}
                  >
                    <ChevronDown size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {orders.length === 0 && (
        <div className="empty-state">
          Nenhum pedido encontrado com esses filtros.
        </div>
      )}
    </div>
  );
}
function downloadCSV(orders: Order[]) {
  const rows = [
    [
      "ID",
      "Pedido Petrobras",
      "Contrato",
      "Pedido DELU",
      "Descrição",
      "Data prevista",
      "Próxima etapa",
      "Situação",
    ],
    ...orders.map((o) => [
      o.id,
      o.petrobras,
      o.contract ? "Sim" : "Não",
      o.delu,
      o.description,
      o.delivery,
      o.delivered ? "Concluído" : o.items[0]?.next || "",
      o.delivered
        ? "Entregue"
        : o.items.some((i) => i.status === "Atrasado")
          ? "Atrasado"
          : "Em andamento",
    ]),
  ];
  download(rows, "pedidos-pro.csv");
}
function downloadItemsCSV(orders: Order[]) {
  const rows = [
    [
      "Pedido",
      "Petrobras",
      "DELU",
      "Item",
      "SKU",
      "Descrição",
      "Contratada",
      "Produzida",
      "Inspecionada",
      "Aprovada",
      "Entregue",
      "Saldo",
      "Próxima etapa",
      "Prazo",
    ],
    ...orders.flatMap((o) =>
      o.items.map((i) => [
        o.id,
        o.petrobras,
        o.delu,
        i.id,
        i.sku,
        i.description,
        i.quantity,
        i.produced,
        i.inspected,
        i.approved,
        i.delivered,
        i.quantity - i.delivered,
        i.next,
        i.due,
      ]),
    ),
  ];
  download(rows, "datasheet-itens.csv");
}
function download(rows: unknown[][], name: string) {
  const csv = rows
    .map((r) =>
      r.map((v) => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(";"),
    )
    .join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
