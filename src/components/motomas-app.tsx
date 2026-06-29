"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowRight,
  BarChart3,
  Bell,
  Bike,
  Boxes,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  Download,
  Eye,
  FileText,
  Filter,
  Landmark,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Moon,
  MoreVertical,
  Package,
  PieChart,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Tag,
  Truck,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  branchName,
  branches,
  formatCurrency,
  getMotorcycleName,
  normalizeAppStateForCatalog,
  PENDING_INFO,
  sellerName,
  sellers,
  type Activity,
  type AppState,
  type Client,
  type ClientStatus,
  type CreditStatus,
  type InventoryItem,
  type Motorcycle,
  type MotoStatus,
  type Quote,
  type Role,
  type TransferOrder,
  type View,
} from "@/lib/motomas-data";
import { cn } from "@/lib/utils";
import { storageKeys } from "@/shared/persistence/storage-keys";

const STORAGE_KEY = "motomas-demo-state-v2";
const SESSION_KEY = storageKeys.demoSession;

type Session = {
  userId: string;
  role: Role;
  name: string;
  branchId: string;
  avatar: string;
};

type MotoMasAppProps = {
  motorcycles: Motorcycle[];
  initialAppState: AppState;
};

type CatalogContextValue = {
  motorcycles: Motorcycle[];
  firstMotorcycle: Motorcycle | null;
  motorcycleName: (id: string) => string;
};

type NavItem = {
  view: View;
  label: string;
  icon: LucideIcon;
};

const CatalogContext = createContext<CatalogContextValue>({
  motorcycles: [],
  firstMotorcycle: null,
  motorcycleName: () => PENDING_INFO,
});

const navItems: NavItem[] = [
  { view: "dashboard", label: "Centro de Operaciones", icon: LayoutDashboard },
  { view: "inventario", label: "Inventario", icon: Package },
  { view: "clientes", label: "Clientes", icon: Users },
  { view: "creditos", label: "Creditos", icon: FileText },
  { view: "traslados", label: "Ordenes de traslado", icon: Truck },
  { view: "vendedores", label: "Vendedores", icon: UserPlus },
  { view: "reportes", label: "Reportes", icon: BarChart3 },
];

const demoSessions: Session[] = [
  {
    userId: "alejandro",
    role: "admin",
    name: "Alejandro M.",
    branchId: "central",
    avatar: "",
  },
  {
    userId: "marco",
    role: "gerente",
    name: "Marco R.",
    branchId: "alajuela",
    avatar: "",
  },
  {
    userId: "roberto",
    role: "vendedor",
    name: "Roberto M.",
    branchId: "central",
    avatar: "",
  },
];

function cloneInitialState(initialAppState: AppState): AppState {
  return JSON.parse(JSON.stringify(initialAppState)) as AppState;
}

function readStoredState(
  initialAppState: AppState,
  motorcycles: Motorcycle[],
): AppState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return cloneInitialState(initialAppState);

    return normalizeAppStateForCatalog(
      JSON.parse(stored) as AppState,
      initialAppState,
      motorcycles,
    );
  } catch {
    return cloneInitialState(initialAppState);
  }
}

function stockStatus(item: InventoryItem): MotoStatus {
  if (item.fisico <= 10) return "Critico";
  if (item.fisico <= 18) return "Stock Bajo";
  if (item.vendidasMes >= 150) return "Alta Demanda";
  return "Disponible";
}

function statusTone(
  status: ClientStatus | CreditStatus | MotoStatus | TransferOrder["status"],
) {
  if (
    status === "Reserva confirmada" ||
    status === "Aprobado" ||
    status === "Disponible" ||
    status === "Completada"
  ) {
    return "green" as const;
  }
  if (
    status === "Evaluacion credito" ||
    status === "Pendiente" ||
    status === "Stock Bajo"
  ) {
    return "yellow" as const;
  }
  if (
    status === "Documentacion" ||
    status === "Observado" ||
    status === "Alta Demanda" ||
    status === "En ruta"
  ) {
    return "blue" as const;
  }
  return "red" as const;
}

function displayStatus(status: ClientStatus | CreditStatus | MotoStatus) {
  const labels: Record<string, string> = {
    "Evaluacion credito": "Evaluacion Credito",
    "Reserva confirmada": "Reserva Confirmada",
    Documentacion: "Documentacion",
    "Entrega pendiente": "Entrega Pendiente",
    Critico: "Critico",
  };
  return labels[status] ?? status;
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function useCatalog() {
  return useContext(CatalogContext);
}

function pendingText(value: string | null | undefined) {
  return value?.trim() ? value : PENDING_INFO;
}

function motorcycleMeta(motorcycle: Motorcycle) {
  const parts = [motorcycle.category, motorcycle.specs].filter(
    (item): item is string => Boolean(item),
  );
  return parts.length ? parts.join(" - ") : PENDING_INFO;
}

function motorcycleDetails(motorcycle: Motorcycle) {
  const details = [
    motorcycle.colors.length ? `Colores: ${motorcycle.colors.join(", ")}` : null,
    motorcycle.versions.length
      ? `Versiones: ${motorcycle.versions.join(", ")}`
      : null,
  ].filter((item): item is string => Boolean(item));

  return details.length ? details.join(" | ") : null;
}

function MotorcycleImage({
  motorcycle,
  className,
  imageClassName,
  showLabel = true,
}: {
  motorcycle: Motorcycle;
  className?: string;
  imageClassName?: string;
  showLabel?: boolean;
}) {
  if (motorcycle.image) {
    return (
      <img
        alt={motorcycle.name}
        className={cn("h-full w-full object-cover", imageClassName, className)}
        src={motorcycle.image}
      />
    );
  }

  return (
    <div
      className={cn(
        "grid h-full w-full place-items-center bg-[linear-gradient(135deg,#171717,#0b0b0c)] p-4 text-center",
        className,
      )}
    >
      <div>
        <Bike className="mx-auto h-8 w-8 text-zinc-600" />
        {showLabel ? (
          <div className="mt-3 text-xs font-bold leading-5 text-zinc-500">
            {PENDING_INFO}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function AvatarBadge({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <div
      aria-label={name}
      className={cn(
        "grid shrink-0 place-items-center rounded-xl border border-white/10 bg-[linear-gradient(135deg,#2a2a2d,#101012)] font-black text-zinc-200 shadow-inner",
        className,
      )}
      role="img"
    >
      {initials(name)}
    </div>
  );
}

function EmptyCatalogState({
  title = "Catálogo pendiente",
}: {
  title?: string;
}) {
  return (
    <Card className="p-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl border border-white/10 bg-white/[0.045]">
        <Bike className="h-7 w-7 text-zinc-500" />
      </div>
      <h2 className="mt-5 text-2xl font-black">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
        {PENDING_INFO}
      </p>
    </Card>
  );
}

export function MotoMasApp({ initialAppState, motorcycles }: MotoMasAppProps) {
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [appState, setAppState] = useState<AppState>(() =>
    cloneInitialState(initialAppState),
  );
  const [selectedClientId, setSelectedClientId] = useState(
    initialAppState.clients[0]?.id ?? "",
  );
  const [selectedBranch, setSelectedBranch] = useState("central");
  const catalogValue = useMemo<CatalogContextValue>(
    () => ({
      motorcycles,
      firstMotorcycle: motorcycles[0] ?? null,
      motorcycleName: (id) => getMotorcycleName(motorcycles, id),
    }),
    [motorcycles],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedState = readStoredState(initialAppState, motorcycles);
      setAppState(storedState);
      setSelectedClientId(storedState.clients[0]?.id ?? "");
      const storedSession = window.localStorage.getItem(SESSION_KEY);
      if (storedSession) {
        setSession(JSON.parse(storedSession) as Session);
      }
      setIsReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialAppState, motorcycles]);

  function updateAppState(updater: (current: AppState) => AppState) {
    setAppState((current) => {
      const next = updater(current);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function login(nextSession: Session) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    setSelectedBranch(nextSession.branchId);
    setView("dashboard");
  }

  function logout() {
    window.localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setView("dashboard");
  }

  function resetDemo() {
    const next = cloneInitialState(initialAppState);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setAppState(next);
    setSelectedClientId(next.clients[0]?.id ?? "");
  }

  if (!isReady) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#050505] text-zinc-400">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-red-600" />
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onLogin={login} />;
  }

  const selectedClient =
    appState.clients.find((client) => client.id === selectedClientId) ??
    appState.clients[0];
  const activeView =
    session.role === "vendedor" && view === "reportes" ? "dashboard" : view;
  const resolvedView =
    activeView === "expediente" && !selectedClient ? "clientes" : activeView;

  const screen = {
    dashboard: (
      <DashboardScreen appState={appState} setView={setView} session={session} />
    ),
    inventario: (
      <InventoryScreen
        appState={appState}
        selectedBranch={selectedBranch}
        setSelectedBranch={setSelectedBranch}
        updateAppState={updateAppState}
      />
    ),
    clientes: (
      <ClientsScreen
        appState={appState}
        openClient={(id) => {
          setSelectedClientId(id);
          setView("expediente");
        }}
        updateAppState={updateAppState}
      />
    ),
    expediente: selectedClient ? (
      <ClientRecordScreen
        appState={appState}
        client={selectedClient}
        goBack={() => setView("clientes")}
        updateAppState={updateAppState}
      />
    ) : (
      <ClientsScreen
        appState={appState}
        openClient={(id) => {
          setSelectedClientId(id);
          setView("expediente");
        }}
        updateAppState={updateAppState}
      />
    ),
    creditos: (
      <CreditsScreen appState={appState} updateAppState={updateAppState} />
    ),
    traslados: (
      <TransfersScreen
        appState={appState}
        session={session}
        updateAppState={updateAppState}
      />
    ),
    vendedores: <SellersScreen />,
    reportes: (
      <ReportsScreen appState={appState} session={session} setView={setView} />
    ),
  }[resolvedView];

  return (
    <CatalogContext.Provider value={catalogValue}>
      <div className="min-h-screen bg-[#050505] text-zinc-100">
        <div className="pointer-events-none fixed inset-x-0 top-0 z-0 mx-auto h-56 max-w-5xl bg-[radial-gradient(circle_at_50%_0%,rgba(239,35,45,0.5),rgba(239,35,45,0.12)_34%,transparent_70%)] blur-2xl" />
        <div className="relative z-10 lg:flex">
          <Sidebar
            activeView={resolvedView}
            session={session}
            setView={setView}
            logout={logout}
          />
          <main className="min-w-0 flex-1 lg:pl-[276px]">
            <TopBar
              view={resolvedView}
              session={session}
              resetDemo={resetDemo}
              setView={setView}
            />
            <div className="mx-auto max-w-[1520px] px-4 py-6 sm:px-8 lg:px-10">
              {screen}
            </div>
          </main>
        </div>
      </div>
    </CatalogContext.Provider>
  );
}

function LoginScreen({ onLogin }: { onLogin: (session: Session) => void }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(239,35,45,0.56),rgba(239,35,45,0.12)_38%,transparent_68%)] blur-2xl" />
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[1fr_420px]">
        <section>
          <Logo large />
          <div className="mt-12 max-w-2xl">
            <Badge tone="red" className="mb-5">
              Demo Comercial Multi-Sucursal
            </Badge>
            <h1 className="text-5xl font-black leading-tight tracking-normal text-white sm:text-6xl">
              Plataforma Integral de Gestion Comercial
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-zinc-400">
              Operacion MotoMas para 12 sucursales, expedientes comerciales,
              creditos, inventario y traslados con datos simulados.
            </p>
          </div>
          <div className="mt-10 grid max-w-2xl gap-4 sm:grid-cols-3">
            {[
              ["12", "Sucursales"],
              ["542", "Clientes activos"],
              ["124", "Motocicletas disponibles"],
            ].map(([value, label]) => (
              <div
                className="rounded-2xl border border-white/10 bg-white/[0.045] p-5"
                key={label}
              >
                <div className="text-3xl font-black">{value}</div>
                <div className="mt-1 text-sm text-zinc-500">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <Card className="bg-[#111111]/95 p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black">Login demo</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Selecciona un perfil operativo
              </p>
            </div>
            <div className="rounded-xl bg-red-600 p-3 shadow-[0_18px_40px_rgba(239,35,45,0.32)]">
              <LockKeyhole className="h-5 w-5" />
            </div>
          </div>
          <div className="space-y-3">
            {demoSessions.map((demoSession) => (
              <button
                className="group flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-left transition hover:border-red-500/40 hover:bg-red-500/10"
                key={demoSession.userId}
                onClick={() => onLogin(demoSession)}
                type="button"
              >
                <AvatarBadge className="h-12 w-12" name={demoSession.name} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-white">{demoSession.name}</div>
                  <div className="text-sm capitalize text-zinc-500">
                    {demoSession.role} - {branchName(demoSession.branchId)}
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-zinc-600 transition group-hover:translate-x-1 group-hover:text-red-400" />
              </button>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}

function Sidebar({
  activeView,
  session,
  setView,
  logout,
}: {
  activeView: View;
  session: Session;
  setView: (view: View) => void;
  logout: () => void;
}) {
  const visibleNav = navItems.filter(
    (item) => !(item.view === "reportes" && session.role === "vendedor"),
  );

  return (
    <aside className="border-b border-white/10 bg-[#0b0b0c]/95 backdrop-blur lg:fixed lg:inset-y-0 lg:left-0 lg:w-[276px] lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-5 py-7">
          <Logo />
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 py-4 lg:flex-1 lg:flex-col lg:gap-3 lg:overflow-visible lg:py-8">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active =
              activeView === item.view ||
              (activeView === "expediente" && item.view === "clientes");
            return (
              <button
                className={cn(
                  "flex min-w-max items-center gap-4 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition lg:min-w-0",
                  active
                    ? "border-red-500/35 bg-red-500/13 text-red-400"
                    : "border-transparent text-zinc-400 hover:bg-white/[0.055] hover:text-zinc-100",
                )}
                key={item.view}
                onClick={() => setView(item.view)}
                type="button"
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="lg:text-lg">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="hidden border-t border-white/10 p-5 lg:block">
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
            <div className="flex items-center gap-3">
              <AvatarBadge className="h-12 w-12" name={session.name} />
              <div className="min-w-0">
                <div className="truncate font-bold">{session.name}</div>
                <div className="text-sm capitalize text-zinc-500">
                  {session.role}
                </div>
              </div>
            </div>
            <Button
              className="mt-4 w-full"
              onClick={logout}
              size="sm"
              variant="secondary"
            >
              <LogOut className="h-4 w-4" />
              Cerrar Sesion
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TopBar({
  view,
  session,
  resetDemo,
  setView,
}: {
  view: View;
  session: Session;
  resetDemo: () => void;
  setView: (view: View) => void;
}) {
  const titles: Record<View, { title: string; subtitle: string }> = {
    dashboard: {
      title: `Bienvenido, ${session.name.split(" ")[0]}`,
      subtitle: "Resumen operativo - Hoy, 14 Oct 2023",
    },
    inventario: {
      title: "Gestion de Inventario",
      subtitle: "Control de stock operativo y disponibilidad por modelo",
    },
    clientes: {
      title: "Expedientes de Clientes",
      subtitle: "Seguimiento comercial y gestion de prospectos en tiempo real",
    },
    expediente: {
      title: "Expediente Comercial",
      subtitle: "Cotizaciones, credito y trazabilidad por cliente",
    },
    creditos: {
      title: "Gestion de Creditos",
      subtitle: "Evaluacion financiera y aprobaciones comerciales",
    },
    traslados: {
      title: "Ordenes de Traslado",
      subtitle: "Movimiento de inventario entre sucursales MotoMas",
    },
    vendedores: {
      title: "Vendedores",
      subtitle: "Actividad comercial por sucursal y ejecutivo",
    },
    reportes: {
      title: "Reportes Operativos",
      subtitle: "Indicadores comerciales con permisos por rol",
    },
  };

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0b0c]/88 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[92px] max-w-[1520px] items-center justify-between gap-4 px-4 py-4 sm:px-8 lg:px-10">
        <div>
          <h1 className="text-2xl font-black tracking-normal text-white sm:text-3xl">
            {titles[view].title}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 sm:text-base">
            {titles[view].subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            className="hidden sm:inline-flex"
            onClick={resetDemo}
            size="sm"
            variant="secondary"
          >
            <Settings className="h-4 w-4" />
            Reset
          </Button>
          <Button
            className="hidden sm:inline-flex"
            onClick={() => setView("dashboard")}
            size="icon"
            variant="secondary"
          >
            <Moon className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="secondary">
            <Bell className="h-4 w-4" />
          </Button>
          <AvatarBadge className="h-11 w-11 text-sm" name={session.name} />
        </div>
      </div>
    </header>
  );
}

function Logo({ large = false }: { large?: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          "grid place-items-center rounded-xl bg-red-600 text-white shadow-[0_16px_34px_rgba(239,35,45,0.32)]",
          large ? "h-14 w-14" : "h-11 w-11",
        )}
      >
        <Bike className={large ? "h-8 w-8" : "h-6 w-6"} />
      </div>
      <div
        className={cn(
          "font-black text-white",
          large ? "text-3xl" : "text-2xl",
        )}
      >
        MotoMas
      </div>
    </div>
  );
}

function DashboardScreen({
  appState,
  setView,
  session,
}: {
  appState: AppState;
  setView: (view: View) => void;
  session: Session;
}) {
  const { motorcycles } = useCatalog();
  const totals = useMemo(() => {
    const allInventory = Object.values(appState.inventory).flatMap((branch) =>
      Object.values(branch),
    );
    return {
      stock: allInventory.reduce((sum, item) => sum + item.fisico, 0),
      reserved: allInventory.reduce((sum, item) => sum + item.reservadas, 0),
      pendingCredits: appState.credits.filter(
        (credit) => credit.status === "Pendiente",
      ).length,
      clients: appState.clients.length + 537,
    };
  }, [appState]);

  const demand = motorcycles.slice(0, 2);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <section className="space-y-8">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Boxes}
            label="Motocicletas disponibles"
            value={totals.stock}
            note="+12% vs mes anterior"
            tone="green"
          />
          <StatCard
            icon={ClipboardCheck}
            label="Creditos en evaluacion"
            value={totals.pendingCredits}
            note="Pendientes - Prioridad alta"
            tone="yellow"
          />
          <StatCard
            icon={Tag}
            label="Motocicletas reservadas"
            value={totals.reserved}
            note="4 hoy - Aseguradas"
            tone="green"
          />
          <StatCard
            icon={Users}
            label="Clientes activos"
            value={totals.clients}
            note="+5% Crecimiento"
            tone="green"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-black">Motocicletas con Mayor Demanda</h2>
          <button
            className="flex items-center gap-2 text-sm font-bold text-red-500"
            onClick={() => setView("inventario")}
            type="button"
          >
            Ver catalogo
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6">
          {demand.length ? null : (
            <EmptyCatalogState title="Motocicletas pendientes" />
          )}
          {demand.map((motorcycle, index) => {
            const stock = appState.inventory.central?.[motorcycle.id] ?? {
              fisico: 0,
              reservadas: 0,
              vendidasMes: 0,
              creditosActivos: 0,
            };
            const details = motorcycleDetails(motorcycle);
            return (
              <Card
                className="grid gap-6 overflow-hidden p-6 md:grid-cols-[300px_1fr]"
                key={motorcycle.id}
              >
                <div className="relative min-h-[190px] overflow-hidden rounded-xl bg-zinc-900">
                  <MotorcycleImage
                    imageClassName="opacity-80"
                    motorcycle={motorcycle}
                  />
                  {index === 0 ? (
                    <Badge
                      className="absolute left-4 top-4 bg-black/70 text-white"
                      tone="gray"
                    >
                      Top Venta
                    </Badge>
                  ) : null}
                </div>
                <div className="flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-black uppercase">
                          {motorcycle.name}
                        </h3>
                        <p className="mt-1 text-zinc-500">
                          {motorcycleMeta(motorcycle)}
                        </p>
                        {details ? (
                          <p className="mt-1 text-sm text-zinc-600">{details}</p>
                        ) : null}
                      </div>
                      <div className="rounded-xl border border-white/10 px-4 py-2 text-center">
                        <div className="text-xs text-zinc-500">Stock</div>
                        <div className="text-xl font-black">{stock.fisico}</div>
                      </div>
                    </div>
                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      <MiniMetric
                        icon={Eye}
                        label="Interesados"
                        value={index === 0 ? 186 : 94}
                      />
                      <MiniMetric
                        icon={FileText}
                        label="Creditos Activos"
                        value={stock.creditosActivos}
                      />
                      <MiniMetric
                        icon={LockKeyhole}
                        label="Reservadas"
                        value={stock.reservadas}
                      />
                    </div>
                  </div>
                  <Button
                    className="mt-6 w-full"
                    onClick={() => setView("inventario")}
                    variant={index === 0 ? "default" : "secondary"}
                  >
                    Ver Detalles Operativos
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <ActivityPanel activities={appState.activities} session={session} />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  note: string;
  tone: "green" | "yellow";
}) {
  return (
    <Card className="relative overflow-hidden p-6">
      <Icon className="absolute right-8 top-8 h-16 w-16 text-white/[0.08]" />
      <div className="grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/[0.045]">
        <Icon className="h-6 w-6 text-red-500" />
      </div>
      <p className="mt-5 text-sm font-medium text-zinc-500">{label}</p>
      <div className="mt-2 text-4xl font-black">{value}</div>
      <div
        className={cn(
          "mt-4 inline-flex rounded-lg px-3 py-1 text-sm font-bold",
          tone === "green"
            ? "bg-emerald-500/13 text-emerald-300"
            : "bg-amber-500/13 text-amber-300",
        )}
      >
        {note}
      </div>
    </Card>
  );
}

function MiniMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-xl font-black">{value}</div>
    </div>
  );
}

function ActivityPanel({
  activities,
  session,
}: {
  activities: Activity[];
  session: Session;
}) {
  const iconByType: Record<Activity["type"], LucideIcon> = {
    Aprobado: Check,
    Reserva: LockKeyhole,
    Documentos: FileText,
    Venta: Bike,
    Traslado: Truck,
  };
  const colorByType: Record<Activity["type"], string> = {
    Aprobado: "text-emerald-300 bg-emerald-500/20 border-emerald-500/30",
    Reserva: "text-amber-300 bg-amber-500/20 border-amber-500/30",
    Documentos: "text-blue-300 bg-blue-500/20 border-blue-500/30",
    Venta: "text-red-300 bg-red-500/20 border-red-500/30",
    Traslado: "text-sky-300 bg-sky-500/20 border-sky-500/30",
  };

  return (
    <Card className="min-h-[720px] p-6">
      <div className="mb-8 flex items-center justify-between">
        <h2 className="text-xl font-black">Actividad Reciente</h2>
        <MoreVertical className="h-5 w-5 text-zinc-600" />
      </div>
      <div className="relative mx-auto max-w-[260px]">
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/10" />
        <div className="space-y-8">
          {activities.map((activity, index) => {
            const Icon = iconByType[activity.type];
            return (
              <div
                className={cn(
                  "relative flex items-center gap-4",
                  index % 2 === 0 ? "justify-end" : "justify-start",
                )}
                key={activity.id}
              >
                <div
                  className={cn(
                    "absolute left-1/2 z-10 grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full border",
                    colorByType[activity.type],
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div
                  className={cn(
                    "w-[118px] rounded-xl border border-white/10 bg-white/[0.035] p-4",
                    index % 2 === 0 ? "mr-[76px]" : "ml-[76px]",
                  )}
                >
                  <div className="flex justify-between gap-2 text-xs">
                    <span
                      className={cn(
                        "font-bold",
                        activity.type === "Aprobado" && "text-emerald-300",
                        activity.type === "Reserva" && "text-amber-300",
                        activity.type === "Documentos" && "text-blue-300",
                        activity.type === "Venta" && "text-red-300",
                        activity.type === "Traslado" && "text-sky-300",
                      )}
                    >
                      {activity.type}
                    </span>
                    <span className="text-right text-zinc-600">
                      hace {activity.minutes} min
                    </span>
                  </div>
                  <div className="mt-3 text-sm font-bold">{activity.title}</div>
                  <div className="mt-1 text-xs leading-5 text-zinc-500">
                    {activity.detail}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Button className="mt-8 w-full" variant="secondary">
        Ver todo el historial
      </Button>
      <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-500">
        Sesion activa:{" "}
        <span className="font-bold text-zinc-200">{session.name}</span>
      </div>
    </Card>
  );
}

function InventoryScreen({
  appState,
  selectedBranch,
  setSelectedBranch,
  updateAppState,
}: {
  appState: AppState;
  selectedBranch: string;
  setSelectedBranch: (branchId: string) => void;
  updateAppState: (updater: (current: AppState) => AppState) => void;
}) {
  const { firstMotorcycle, motorcycles, motorcycleName } = useCatalog();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "reserved">("all");
  const inventory = appState.inventory[selectedBranch] ?? {};

  const rows = motorcycles
    .map((motorcycle) => ({
      motorcycle,
      item: inventory[motorcycle.id] ?? {
        fisico: 0,
        reservadas: 0,
        vendidasMes: 0,
        creditosActivos: 0,
      },
      status: stockStatus(
        inventory[motorcycle.id] ?? {
          fisico: 0,
          reservadas: 0,
          vendidasMes: 0,
          creditosActivos: 0,
        },
      ),
    }))
    .filter(({ motorcycle, item, status }) => {
      const sku = motorcycle.sku ?? "";
      const matches =
        motorcycle.name.toLowerCase().includes(query.toLowerCase()) ||
        sku.toLowerCase().includes(query.toLowerCase());
      const filterMatches =
        filter === "all" ||
        (filter === "low" && (status === "Stock Bajo" || status === "Critico")) ||
        (filter === "reserved" && item.reservadas > 0);
      return matches && filterMatches;
    });

  function addLot(motorcycleId: string, quantity: number) {
    updateAppState((current) => ({
      ...current,
      inventory: {
        ...current.inventory,
        [selectedBranch]: {
          ...current.inventory[selectedBranch],
          [motorcycleId]: {
            ...current.inventory[selectedBranch][motorcycleId],
            fisico: current.inventory[selectedBranch][motorcycleId].fisico + quantity,
          },
        },
      },
      activities: [
        {
          id: makeId("act"),
          type: "Traslado" as const,
          title: "Ingreso de lote",
          detail: `${branchName(selectedBranch)} - ${motorcycleName(motorcycleId)}`,
          minutes: 1,
        },
        ...current.activities,
      ].slice(0, 6),
    }));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div className="flex flex-wrap gap-3">
            <Select
              label="Sucursal"
              value={selectedBranch}
              onChange={setSelectedBranch}
              options={branches.map((branch) => ({
                value: branch.id,
                label: branch.name,
              }))}
            />
            <div className="relative w-full sm:w-[340px]">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
              <Input
                className="pl-12"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar modelo o SKU..."
                value={query}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button size="icon" variant="secondary">
              <Download className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="secondary">
              <Filter className="h-4 w-4" />
            </Button>
            <Button
              disabled={!firstMotorcycle}
              onClick={() => firstMotorcycle && addLot(firstMotorcycle.id, 6)}
            >
              <Plus className="h-4 w-4" />
              Ingreso de Lote
            </Button>
          </div>
        </div>

        <Tabs
          active={filter}
          items={[
            { id: "all", label: "Todo el Stock" },
            { id: "low", label: "Bajo Stock" },
            { id: "reserved", label: "Reservados" },
          ]}
          onChange={(value) => setFilter(value as typeof filter)}
        />

        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1.7fr_0.7fr_0.8fr_0.9fr_1fr_1.2fr_42px] border-b border-white/10 px-7 py-5 text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
            <div>Modelo</div>
            <div>Stock Fisico</div>
            <div>Reservadas</div>
            <div>Vendidas (Mes)</div>
            <div>Creditos Activos</div>
            <div>Estado Operativo</div>
            <div />
          </div>
          <div>
            {rows.length ? null : (
              <div className="px-7 py-7">
                <EmptyCatalogState title="Inventario pendiente" />
              </div>
            )}
            {rows.map(({ motorcycle, item, status }) => (
              <div
                className="grid grid-cols-[1.7fr_0.7fr_0.8fr_0.9fr_1fr_1.2fr_42px] items-center border-b border-white/6 px-7 py-7 last:border-b-0"
                key={motorcycle.id}
              >
                <div className="flex items-center gap-4">
                  <MotorcycleImage
                    className="h-16 w-16 overflow-hidden rounded-lg border border-white/10"
                    motorcycle={motorcycle}
                    showLabel={false}
                  />
                  <div>
                    <div className="max-w-[120px] text-lg font-black leading-6">
                      {motorcycle.name}
                    </div>
                    <div className="mt-1 max-w-[110px] text-sm text-zinc-600">
                      SKU: {pendingText(motorcycle.sku)}
                    </div>
                  </div>
                </div>
                <div
                  className={cn(
                    "text-xl font-black",
                    status === "Critico" && "text-red-500",
                  )}
                >
                  {item.fisico}
                </div>
                <div className="text-lg text-zinc-400">{item.reservadas}</div>
                <div className="text-lg text-zinc-400">{item.vendidasMes}</div>
                <div
                  className={cn(
                    "text-lg font-bold",
                    item.creditosActivos >= 10
                      ? "text-emerald-300"
                      : "text-amber-300",
                  )}
                >
                  {item.creditosActivos}
                </div>
                <div>
                  <Badge tone={statusTone(status)}>{displayStatus(status)}</Badge>
                </div>
                <MoreVertical className="h-5 w-5 text-zinc-600" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-white/10 px-7 py-5 text-sm text-zinc-500">
            <span>
              Mostrando {rows.length} de {motorcycles.length} modelos
            </span>
            <div className="flex items-center gap-2">
              <ChevronLeft className="h-5 w-5" />
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/[0.06] text-white">
                1
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-lg">
                2
              </span>
              <ChevronRight className="h-5 w-5" />
            </div>
          </div>
        </Card>
      </section>

      <StockAlerts
        inventory={inventory}
        selectedBranch={selectedBranch}
        addLot={addLot}
      />
    </div>
  );
}

function StockAlerts({
  inventory,
  selectedBranch,
  addLot,
}: {
  inventory: Record<string, InventoryItem>;
  selectedBranch: string;
  addLot: (motorcycleId: string, quantity: number) => void;
}) {
  const { motorcycles } = useCatalog();
  const entries = motorcycles.map((motorcycle) => ({
    motorcycle,
    item: inventory[motorcycle.id] ?? {
      fisico: 0,
      reservadas: 0,
      vendidasMes: 0,
      creditosActivos: 0,
    },
    status: stockStatus(
      inventory[motorcycle.id] ?? {
        fisico: 0,
        reservadas: 0,
        vendidasMes: 0,
        creditosActivos: 0,
      },
    ),
  }));

  return (
    <Card className="p-6">
      <div className="mb-7 flex items-center justify-between">
        <h2 className="text-xl font-black">Alertas de Stock</h2>
        <span className="h-3 w-3 rounded-full bg-red-500 shadow-[0_0_18px_rgba(239,35,45,0.8)]" />
      </div>
      <div className="space-y-4">
        {entries.length ? null : (
          <EmptyCatalogState title="Alertas pendientes" />
        )}
        {entries.map(({ motorcycle, item, status }) => (
          <div
            className={cn(
              "rounded-xl border p-5",
              status === "Disponible" &&
                "border-emerald-500/15 bg-emerald-500/7",
              status === "Stock Bajo" &&
                "border-amber-500/20 bg-amber-500/8",
              status === "Alta Demanda" && "border-blue-500/20 bg-blue-500/8",
              status === "Critico" && "border-red-500/20 bg-red-500/9",
            )}
            key={motorcycle.id}
          >
            <div className="flex gap-3">
              <span
                className={cn(
                  "mt-2 h-2.5 w-2.5 rounded-full",
                  status === "Disponible" && "bg-emerald-400",
                  status === "Stock Bajo" && "bg-amber-400",
                  status === "Alta Demanda" && "bg-blue-400",
                  status === "Critico" && "bg-red-500",
                )}
              />
              <div>
                <div className="text-lg font-black">{motorcycle.name}</div>
                <div
                  className={cn(
                    "font-bold",
                    status === "Disponible" && "text-emerald-300",
                    status === "Stock Bajo" && "text-amber-300",
                    status === "Alta Demanda" && "text-blue-300",
                    status === "Critico" && "text-red-400",
                  )}
                >
                  {displayStatus(status)}
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  {item.fisico} unidades en {branchName(selectedBranch)}.{" "}
                  {status === "Critico"
                    ? "Riesgo de quiebre de stock."
                    : status === "Stock Bajo"
                      ? "Sugerencia de pedido: 20 unidades adicionales."
                      : status === "Alta Demanda"
                        ? "Rotacion superior al promedio mensual."
                        : "Nivel optimo de reabastecimiento."}
                </p>
                {status !== "Disponible" ? (
                  <Button
                    className="mt-4 w-full"
                    onClick={() => addLot(motorcycle.id, 5)}
                    size="sm"
                    variant={status === "Critico" ? "default" : "secondary"}
                  >
                    {status === "Critico"
                      ? "Solicitar Transferencia"
                      : "Gestionar Pedido"}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 border-t border-white/10 pt-7">
        <h3 className="mb-5 text-sm font-black uppercase tracking-[0.16em] text-zinc-500">
          Resumen Semanal
        </h3>
        <SummaryLine label="Salidas" value="24 uds." />
        <SummaryLine label="Entradas" value="50 uds." />
        <SummaryLine
          label="Valor Total"
          value="+$248,500"
          valueClassName="text-emerald-300"
        />
      </div>
    </Card>
  );
}

function ClientsScreen({
  appState,
  openClient,
  updateAppState,
}: {
  appState: AppState;
  openClient: (id: string) => void;
  updateAppState: (updater: (current: AppState) => AppState) => void;
}) {
  const { firstMotorcycle, motorcycleName } = useCatalog();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"Todos" | "Credito" | "Contado" | "Pendientes">(
    "Todos",
  );
  const activeSellers = sellers.filter((seller) => seller.active);

  const filtered = appState.clients.filter((client) => {
    const motorcycle = motorcycleName(client.motorcycleId);
    const matches =
      client.name.toLowerCase().includes(query.toLowerCase()) ||
      client.document.toLowerCase().includes(query.toLowerCase()) ||
      motorcycle.toLowerCase().includes(query.toLowerCase());
    const filterMatches =
      filter === "Todos" ||
      (filter === "Credito" && client.financial !== "Contado") ||
      (filter === "Contado" && client.financial === "Contado") ||
      (filter === "Pendientes" && client.status !== "Reserva confirmada");
    return matches && filterMatches;
  });

  function createClient() {
    if (!firstMotorcycle) return;

    const nextClient: Client = {
      id: `exp-2024-${1100 + appState.clients.length}`,
      name: "Nuevo Prospecto",
      document: "0-0000-0000",
      city: "San Jose, Costa Rica",
      avatar: "",
      status: "Evaluacion credito",
      motorcycleId: firstMotorcycle.id,
      financial: "MongePay",
      sellerId: "roberto",
      branchId: "central",
      lastContact: "ahora",
      quotes: [
        {
          id: makeId("q"),
          branchId: "central",
          sellerId: "roberto",
          motorcycleId: firstMotorcycle.id,
          createdAt: "2024-10-14",
          amount: firstMotorcycle.price,
          status: "Abierta",
        },
      ],
    };
    updateAppState((current) => ({
      ...current,
      clients: [nextClient, ...current.clients],
      activities: [
        {
          id: makeId("act"),
          type: "Documentos" as const,
          title: "Nuevo expediente",
          detail: `${nextClient.id} creado`,
          minutes: 1,
        },
        ...current.activities,
      ].slice(0, 6),
    }));
  }

  return (
    <section className="space-y-7">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div className="relative w-full max-w-[420px]">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
          <Input
            className="pl-12"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, DNI o moto..."
            value={query}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
            Filtrar:
          </div>
          <Tabs
            active={filter}
            items={[
              { id: "Todos", label: "Todos" },
              { id: "Credito", label: "Credito" },
              { id: "Contado", label: "Contado" },
              { id: "Pendientes", label: "Pendientes" },
            ]}
            onChange={(value) => setFilter(value as typeof filter)}
          />
          <div className="ml-0 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.045] px-4 py-2 xl:ml-6">
            <div className="flex -space-x-3">
              {activeSellers.slice(0, 3).map((seller) => (
                <AvatarBadge
                  className="h-8 w-8 rounded-full border-2 border-[#111] text-[10px]"
                  key={seller.id}
                  name={seller.name}
                />
              ))}
            </div>
            <span className="text-sm text-zinc-400">
              {activeSellers.length} Vendedores Activos
            </span>
          </div>
          <Button disabled={!firstMotorcycle} onClick={createClient}>
            <UserPlus className="h-4 w-4" />
            Nuevo Expediente
          </Button>
          <Button size="icon" variant="secondary">
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {filtered.length ? null : (
          <EmptyCatalogState title="Expedientes pendientes" />
        )}
        {filtered.map((client) => (
          <ClientCard client={client} key={client.id} openClient={openClient} />
        ))}
        <button
          className="grid min-h-[250px] place-items-center rounded-2xl border border-dashed border-white/10 bg-black/20 text-zinc-600 transition hover:border-red-500/30 hover:text-red-400"
          onClick={createClient}
          type="button"
        >
          <Plus className="h-10 w-10" />
        </button>
      </div>
      <div className="sticky bottom-0 flex items-center justify-between border-t border-white/10 bg-[#090909]/90 px-2 py-5 text-sm text-zinc-500 backdrop-blur-xl">
        <span>Mostrando {filtered.length} de 142 expedientes comerciales</span>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="secondary">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {[1, 2, 3].map((page) => (
            <Button
              key={page}
              size="icon"
              variant={page === 1 ? "default" : "secondary"}
            >
              {page}
            </Button>
          ))}
          <Button size="icon" variant="secondary">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function ClientCard({
  client,
  openClient,
}: {
  client: Client;
  openClient: (id: string) => void;
}) {
  const { motorcycles } = useCatalog();
  const motorcycle = motorcycles.find((item) => item.id === client.motorcycleId);
  return (
    <Card className="overflow-hidden p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-5">
          <div className="relative">
            <AvatarBadge className="h-20 w-20 rounded-2xl text-xl" name={client.name} />
            <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-[#111] bg-red-600">
              <Bike className="h-3.5 w-3.5" />
            </span>
          </div>
          <div>
            <h2 className="text-2xl font-black">{client.name}</h2>
            <div className="mt-1 font-mono text-sm text-zinc-500">
              ID: {client.id.toUpperCase()}
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
              <MapPin className="h-4 w-4" />
              {client.city}
            </div>
          </div>
        </div>
        <Badge tone={statusTone(client.status)}>{displayStatus(client.status)}</Badge>
      </div>

      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        <InfoTile
          icon={Bike}
          label="Moto de Interes"
          value={motorcycle?.name ?? PENDING_INFO}
          tone="red"
        />
        <InfoTile
          icon={Landmark}
          label="Financiera"
          value={client.financial}
          tone="green"
        />
      </div>

      <div className="mt-7 flex items-center justify-between border-t border-white/7 pt-6">
        <div className="flex items-center gap-3">
          <AvatarBadge
            className="h-11 w-11 rounded-lg text-sm"
            name={sellerName(client.sellerId)}
          />
          <div>
            <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
              Vendedor
            </div>
            <div className="text-sm font-semibold text-zinc-300">
              {sellerName(client.sellerId)}
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Button size="icon" variant="secondary">
            <Mail className="h-4 w-4" />
          </Button>
          <Button onClick={() => openClient(client.id)} size="icon">
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ClientRecordScreen({
  appState,
  client,
  goBack,
  updateAppState,
}: {
  appState: AppState;
  client: Client;
  goBack: () => void;
  updateAppState: (updater: (current: AppState) => AppState) => void;
}) {
  const { firstMotorcycle, motorcycles, motorcycleName } = useCatalog();
  const [branchId, setBranchId] = useState(branches[1].id);
  const [sellerId, setSellerId] = useState(sellers[1].id);
  const [motorcycleId, setMotorcycleId] = useState(firstMotorcycle?.id ?? "");
  const currentCredit = appState.credits.find(
    (credit) => credit.clientId === client.id,
  );

  function addQuote() {
    const motorcycle = motorcycles.find((item) => item.id === motorcycleId);
    if (!motorcycle) return;

    const quote: Quote = {
      id: makeId("q"),
      branchId,
      sellerId,
      motorcycleId,
      createdAt: "2024-10-14",
      amount: motorcycle.price,
      status: "Abierta",
    };

    updateAppState((current) => ({
      ...current,
      clients: current.clients.map((item) =>
        item.id === client.id
          ? {
              ...item,
              motorcycleId,
              branchId,
              sellerId,
              quotes: [quote, ...item.quotes],
              lastContact: "ahora",
            }
          : item,
      ),
      activities: [
        {
          id: makeId("act"),
          type: "Documentos" as const,
          title: "Cotizacion registrada",
          detail: `${client.name} - ${motorcycle.name}`,
          minutes: 1,
        },
        ...current.activities,
      ].slice(0, 6),
    }));
  }

  function setClientStatus(status: ClientStatus) {
    updateAppState((current) => ({
      ...current,
      clients: current.clients.map((item) =>
        item.id === client.id ? { ...item, status } : item,
      ),
    }));
  }

  return (
    <section className="space-y-6">
      <Button onClick={goBack} variant="secondary">
        <ChevronLeft className="h-4 w-4" />
        Volver a clientes
      </Button>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-7">
          <div className="flex flex-col justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-5">
              <AvatarBadge
                className="h-24 w-24 rounded-2xl text-2xl"
                name={client.name}
              />
              <div>
                <Badge tone={statusTone(client.status)}>
                  {displayStatus(client.status)}
                </Badge>
                <h2 className="mt-3 text-3xl font-black">{client.name}</h2>
                <div className="mt-1 font-mono text-sm text-zinc-500">
                  {client.id.toUpperCase()} - DNI {client.document}
                </div>
                <div className="mt-2 flex items-center gap-2 text-zinc-500">
                  <MapPin className="h-4 w-4" />
                  {client.city}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => setClientStatus("Reserva confirmada")}
                variant="success"
              >
                <Check className="h-4 w-4" />
                Reservar
              </Button>
              <Button
                onClick={() => setClientStatus("Entrega pendiente")}
                variant="secondary"
              >
                <Truck className="h-4 w-4" />
                Entrega
              </Button>
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <InfoTile
              icon={Bike}
              label="Moto actual"
              value={motorcycleName(client.motorcycleId)}
              tone="red"
            />
            <InfoTile
              icon={Store}
              label="Sucursal"
              value={branchName(client.branchId)}
              tone="blue"
            />
            <InfoTile
              icon={Landmark}
              label="Financiera"
              value={client.financial}
              tone="green"
            />
          </div>

          <div className="mt-9">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-black">Cotizaciones comerciales</h3>
              <Badge tone="gray">{client.quotes.length} registros</Badge>
            </div>
            <div className="space-y-3">
              {client.quotes.map((quote) => (
                <div
                  className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:grid-cols-[1fr_1fr_1fr_auto]"
                  key={quote.id}
                >
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-600">
                      Modelo
                    </div>
                    <div className="mt-1 font-bold">
                      {motorcycleName(quote.motorcycleId)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-600">
                      Sucursal
                    </div>
                    <div className="mt-1 font-bold">{branchName(quote.branchId)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-600">
                      Vendedor
                    </div>
                    <div className="mt-1 font-bold">{sellerName(quote.sellerId)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black">{formatCurrency(quote.amount)}</div>
                    <div className="mt-1 text-xs text-zinc-500">{quote.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-xl font-black">Nueva cotizacion</h3>
            <div className="mt-5 space-y-4">
              <Select
                label="Sucursal"
                onChange={setBranchId}
                options={branches.map((branch) => ({
                  value: branch.id,
                  label: branch.name,
                }))}
                value={branchId}
              />
              <Select
                label="Vendedor"
                onChange={setSellerId}
                options={sellers.map((seller) => ({
                  value: seller.id,
                  label: `${seller.name} - ${branchName(seller.branchId)}`,
                }))}
                value={sellerId}
              />
              <Select
                label="Motocicleta"
                onChange={setMotorcycleId}
                options={motorcycles.map((motorcycle) => ({
                  value: motorcycle.id,
                  label: motorcycle.name,
                }))}
                value={motorcycleId}
              />
              <Button
                className="w-full"
                disabled={!motorcycleId}
                onClick={addQuote}
              >
                <Plus className="h-4 w-4" />
                Registrar cotizacion
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-xl font-black">Credito</h3>
            {currentCredit ? (
              <div className="mt-5 space-y-4">
                <InfoTile
                  icon={CircleDollarSign}
                  label="Monto"
                  value={formatCurrency(currentCredit.amount)}
                  tone="green"
                />
                <SummaryLine label="Financiera" value={currentCredit.financial} />
                <SummaryLine label="Score" value={String(currentCredit.score)} />
                <SummaryLine
                  label="Estado"
                  value={displayStatus(currentCredit.status)}
                  valueClassName="text-amber-300"
                />
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-500">
                Sin credito activo.
              </div>
            )}
          </Card>
        </div>
      </div>
    </section>
  );
}

function CreditsScreen({
  appState,
  updateAppState,
}: {
  appState: AppState;
  updateAppState: (updater: (current: AppState) => AppState) => void;
}) {
  const { motorcycleName } = useCatalog();

  function updateCredit(id: string, status: CreditStatus) {
    updateAppState((current) => ({
      ...current,
      credits: current.credits.map((credit) =>
        credit.id === id ? { ...credit, status } : credit,
      ),
      clients: current.clients.map((client) => {
        const credit = current.credits.find((item) => item.id === id);
        if (!credit || credit.clientId !== client.id) return client;
        return {
          ...client,
          status:
            status === "Aprobado"
              ? "Reserva confirmada"
              : status === "Rechazado"
                ? "Documentacion"
                : "Evaluacion credito",
        };
      }),
      activities: [
        {
          id: makeId("act"),
          type: (status === "Aprobado"
            ? "Aprobado"
            : "Documentos") as Activity["type"],
          title: `Credito ${displayStatus(status)}`,
          detail: id.toUpperCase(),
          minutes: 1,
        },
        ...current.activities,
      ].slice(0, 6),
    }));
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-5 md:grid-cols-4">
        <StatCard
          icon={CreditCard}
          label="Pendientes"
          note="Prioridad comercial"
          tone="yellow"
          value={appState.credits.filter((credit) => credit.status === "Pendiente").length}
        />
        <StatCard
          icon={ShieldCheck}
          label="Aprobados"
          note="Listos para reserva"
          tone="green"
          value={appState.credits.filter((credit) => credit.status === "Aprobado").length}
        />
        <StatCard
          icon={FileText}
          label="Observados"
          note="Documentacion"
          tone="yellow"
          value={appState.credits.filter((credit) => credit.status === "Observado").length}
        />
        <StatCard
          icon={CircleDollarSign}
          label="Monto activo"
          note="+18% mensual"
          tone="green"
          value={Math.round(
            appState.credits.reduce(
              (sum, credit) => sum + (credit.amount ?? 0),
              0,
            ) / 1000,
          )}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_1fr_0.8fr_1fr_220px] border-b border-white/10 px-7 py-5 text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
          <div>Cliente</div>
          <div>Motocicleta</div>
          <div>Financiera</div>
          <div>Score</div>
          <div>Estado</div>
          <div>Acciones</div>
        </div>
        {appState.credits.map((credit) => {
          const client = appState.clients.find((item) => item.id === credit.clientId);
          return (
            <div
              className="grid grid-cols-[1fr_1fr_1fr_0.8fr_1fr_220px] items-center border-b border-white/7 px-7 py-5 last:border-b-0"
              key={credit.id}
            >
              <div>
                <div className="font-black">{client?.name}</div>
                <div className="mt-1 font-mono text-xs text-zinc-600">
                  {credit.id.toUpperCase()}
                </div>
              </div>
              <div className="font-semibold text-zinc-300">
                {motorcycleName(credit.motorcycleId)}
              </div>
              <div className="text-zinc-400">{credit.financial}</div>
              <div className="text-lg font-black">{credit.score}</div>
              <div>
                <Badge tone={statusTone(credit.status)}>
                  {displayStatus(credit.status)}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => updateCredit(credit.id, "Aprobado")}
                  size="sm"
                  variant="success"
                >
                  Aprobar
                </Button>
                <Button
                  onClick={() => updateCredit(credit.id, "Rechazado")}
                  size="sm"
                  variant="danger"
                >
                  Rechazar
                </Button>
              </div>
            </div>
          );
        })}
      </Card>
    </section>
  );
}

function TransfersScreen({
  appState,
  session,
  updateAppState,
}: {
  appState: AppState;
  session: Session;
  updateAppState: (updater: (current: AppState) => AppState) => void;
}) {
  const { firstMotorcycle, motorcycles, motorcycleName } = useCatalog();
  const [fromBranchId, setFromBranchId] = useState("central");
  const [toBranchId, setToBranchId] = useState("cartago");
  const [motorcycleId, setMotorcycleId] = useState(firstMotorcycle?.id ?? "");
  const [quantity, setQuantity] = useState(2);
  const [message, setMessage] = useState("");

  const available =
    appState.inventory[fromBranchId]?.[motorcycleId]?.fisico ?? 0;

  function createTransfer() {
    setMessage("");
    if (!motorcycleId) {
      setMessage(PENDING_INFO);
      return;
    }
    if (fromBranchId === toBranchId) {
      setMessage("Selecciona sucursales distintas.");
      return;
    }
    if (quantity < 1 || available < quantity) {
      setMessage("Stock insuficiente en la sucursal origen.");
      return;
    }

    const order: TransferOrder = {
      id: makeId("ot"),
      motorcycleId,
      fromBranchId,
      toBranchId,
      quantity,
      status: "Completada",
      createdAt: "2024-10-14",
      requestedBy: session.name,
    };

    updateAppState((current) => {
      const originItem = current.inventory[fromBranchId]?.[motorcycleId] ?? {
        fisico: 0,
        reservadas: 0,
        vendidasMes: 0,
        creditosActivos: 0,
      };
      const destinationItem = current.inventory[toBranchId]?.[motorcycleId] ?? {
        fisico: 0,
        reservadas: 0,
        vendidasMes: 0,
        creditosActivos: 0,
      };
      return {
        ...current,
        inventory: {
          ...current.inventory,
          [fromBranchId]: {
            ...(current.inventory[fromBranchId] ?? {}),
            [motorcycleId]: {
              ...originItem,
              fisico: originItem.fisico - quantity,
            },
          },
          [toBranchId]: {
            ...(current.inventory[toBranchId] ?? {}),
            [motorcycleId]: {
              ...destinationItem,
              fisico: destinationItem.fisico + quantity,
            },
          },
        },
        transferOrders: [order, ...current.transferOrders],
        activities: [
          {
            id: makeId("act"),
            type: "Traslado" as const,
            title: "Traslado completado",
            detail: `${quantity} ${motorcycleName(motorcycleId)}: ${branchName(
              fromBranchId,
            )} a ${branchName(toBranchId)}`,
            minutes: 1,
          },
          ...current.activities,
        ].slice(0, 6),
      };
    });
    setMessage("Orden completada e inventario actualizado.");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <Card className="p-6">
        <h2 className="text-xl font-black">Nueva orden</h2>
        <div className="mt-5 space-y-4">
          <Select
            label="Origen"
            onChange={setFromBranchId}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
            value={fromBranchId}
          />
          <Select
            label="Destino"
            onChange={setToBranchId}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
            value={toBranchId}
          />
          <Select
            label="Motocicleta"
            onChange={setMotorcycleId}
            options={motorcycles.map((motorcycle) => ({
              value: motorcycle.id,
              label: motorcycle.name,
            }))}
            value={motorcycleId}
          />
          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
              Cantidad
            </span>
            <Input
              min={1}
              onChange={(event) => setQuantity(Number(event.target.value))}
              type="number"
              value={quantity}
            />
          </label>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <SummaryLine label="Disponible origen" value={`${available} uds.`} />
            <SummaryLine label="Solicita" value={session.name} />
          </div>
          <Button
            className="w-full"
            disabled={!motorcycleId}
            onClick={createTransfer}
          >
            <Truck className="h-4 w-4" />
            Crear y ejecutar traslado
          </Button>
          {message ? (
            <div
              className={cn(
                "rounded-xl border p-3 text-sm",
                message.includes("actualizado")
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                  : "border-red-500/20 bg-red-500/10 text-red-300",
              )}
            >
              {message}
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_1fr_0.6fr_1fr_1fr] border-b border-white/10 px-7 py-5 text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
          <div>Orden</div>
          <div>Motocicleta</div>
          <div>Ruta</div>
          <div>Cant.</div>
          <div>Estado</div>
          <div>Solicita</div>
        </div>
        {appState.transferOrders.map((order) => (
          <div
            className="grid grid-cols-[1fr_1fr_1fr_0.6fr_1fr_1fr] items-center border-b border-white/7 px-7 py-6 last:border-b-0"
            key={order.id}
          >
            <div>
              <div className="font-black">{order.id.toUpperCase()}</div>
              <div className="mt-1 text-xs text-zinc-600">{order.createdAt}</div>
            </div>
            <div className="font-semibold">{motorcycleName(order.motorcycleId)}</div>
            <div className="text-sm text-zinc-500">
              {branchName(order.fromBranchId)} {"->"}{" "}
              {branchName(order.toBranchId)}
            </div>
            <div className="text-lg font-black">{order.quantity}</div>
            <div>
              <Badge tone={statusTone(order.status)}>{order.status}</Badge>
            </div>
            <div className="text-zinc-400">{order.requestedBy}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function SellersScreen() {
  return (
    <section className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="grid gap-5 md:grid-cols-2">
        {sellers.map((seller) => (
          <Card className="p-6" key={seller.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <AvatarBadge
                  className="h-16 w-16 rounded-2xl text-lg"
                  name={seller.name}
                />
                <div>
                  <h2 className="text-xl font-black">{seller.name}</h2>
                  <div className="mt-1 text-sm capitalize text-zinc-500">
                    {seller.role} - {branchName(seller.branchId)}
                  </div>
                </div>
              </div>
              <Badge tone={seller.active ? "green" : "gray"}>
                {seller.active ? "Activo" : "Pausa"}
              </Badge>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <MiniMetric icon={Bike} label="Ventas" value={seller.deals} />
              <MiniMetric icon={FileText} label="Cotizaciones" value={seller.quotes} />
              <MiniMetric
                icon={ShieldCheck}
                label="Satisfaccion"
                value={seller.satisfaction}
              />
            </div>
          </Card>
        ))}
      </div>
      <Card className="p-6">
        <h2 className="text-xl font-black">Ranking Comercial</h2>
        <div className="mt-6 space-y-5">
          {[...sellers]
            .sort((a, b) => b.deals - a.deals)
            .slice(0, 6)
            .map((seller, index) => (
              <div className="flex items-center gap-4" key={seller.id}>
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/[0.06] text-sm font-black">
                  {index + 1}
                </div>
                <AvatarBadge className="h-10 w-10 rounded-lg text-xs" name={seller.name} />
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{seller.name}</div>
                  <div className="text-xs text-zinc-600">
                    {branchName(seller.branchId)}
                  </div>
                </div>
                <div className="font-black text-emerald-300">{seller.deals}</div>
              </div>
            ))}
        </div>
      </Card>
    </section>
  );
}

function ReportsScreen({
  appState,
  session,
  setView,
}: {
  appState: AppState;
  session: Session;
  setView: (view: View) => void;
}) {
  if (session.role === "vendedor") {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/15 text-red-400">
          <LockKeyhole className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-2xl font-black">Acceso restringido</h2>
        <p className="mt-2 text-zinc-500">
          El perfil vendedor no tiene permisos para visualizar reportes.
        </p>
        <Button className="mt-6" onClick={() => setView("dashboard")}>
          Volver al Centro de Operaciones
        </Button>
      </Card>
    );
  }

  const branchRows = branches.slice(0, 8).map((branch, index) => {
    const branchInventory = appState.inventory[branch.id];
    const stock = Object.values(branchInventory).reduce(
      (sum, item) => sum + item.fisico,
      0,
    );
    const sales = Object.values(branchInventory).reduce(
      (sum, item) => sum + item.vendidasMes,
      0,
    );
    return {
      branch,
      stock,
      sales,
      value: 180000 + index * 42500,
    };
  });
  const maxSales = Math.max(...branchRows.map((row) => row.sales));

  return (
    <section className="space-y-6">
      <div className="grid gap-5 md:grid-cols-4">
        <StatCard
          icon={PieChart}
          label="Ventas red"
          note="+14% vs anterior"
          tone="green"
          value={branchRows.reduce((sum, row) => sum + row.sales, 0)}
        />
        <StatCard
          icon={Building2}
          label="Sucursales"
          note="Operacion activa"
          tone="green"
          value={branches.length}
        />
        <StatCard
          icon={CircleDollarSign}
          label="Pipeline"
          note="Millones CRC"
          tone="yellow"
          value={Math.round(
            appState.credits.reduce(
              (sum, credit) => sum + (credit.amount ?? 0),
              0,
            ) /
              100000,
          )}
        />
        <StatCard
          icon={Users}
          label="Expedientes"
          note="Prospectos activos"
          tone="green"
          value={appState.clients.length + 137}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-black">Rendimiento por sucursal</h2>
            <Badge tone="green">Admin/Gerencia</Badge>
          </div>
          <div className="space-y-5">
            {branchRows.map((row) => (
              <div
                className="grid items-center gap-4 md:grid-cols-[160px_1fr_90px_110px]"
                key={row.branch.id}
              >
                <div>
                  <div className="font-bold">{row.branch.name}</div>
                  <div className="text-xs text-zinc-600">{row.branch.city}</div>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-red-600"
                    style={{ width: `${(row.sales / maxSales) * 100}%` }}
                  />
                </div>
                <div className="font-black">{row.sales}</div>
                <div className="text-right text-sm text-emerald-300">
                  {formatCurrency(row.value)}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-black">Permisos por rol</h2>
          <div className="mt-6 space-y-4">
            <PermissionRow role="Administrador" reports inventory clients />
            <PermissionRow role="Gerente" reports inventory clients />
            <PermissionRow role="Vendedor" inventory clients />
          </div>
          <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/8 p-4 text-sm text-red-200">
            Reportes queda bloqueado para vendedores en navegacion y acceso
            directo.
          </div>
        </Card>
      </div>
    </section>
  );
}

function PermissionRow({
  role,
  reports = false,
  inventory = false,
  clients = false,
}: {
  role: string;
  reports?: boolean;
  inventory?: boolean;
  clients?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="mb-3 font-black">{role}</div>
      <div className="flex flex-wrap gap-2">
        <Badge tone={clients ? "green" : "red"}>Clientes</Badge>
        <Badge tone={inventory ? "green" : "red"}>Inventario</Badge>
        <Badge tone={reports ? "green" : "red"}>Reportes</Badge>
      </div>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: "red" | "green" | "blue";
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 p-4">
      <div className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-zinc-600">
        {label}
      </div>
      <div className="flex items-center gap-3 text-lg font-black">
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "red" && "text-red-500",
            tone === "green" && "text-emerald-400",
            tone === "blue" && "text-blue-400",
          )}
        />
        {value}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </span>
      <select
        className="h-12 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm font-semibold text-zinc-100 outline-none transition focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Tabs({
  active,
  items,
  onChange,
}: {
  active: string;
  items: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((item) => (
        <button
          className={cn(
            "rounded-lg border px-5 py-3 text-sm font-bold transition",
            active === item.id
              ? "border-red-500/35 bg-red-500/13 text-red-400"
              : "border-white/10 bg-white/[0.045] text-zinc-400 hover:text-white",
          )}
          key={item.id}
          onClick={() => onChange(item.id)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function SummaryLine({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4 last:mb-0">
      <span className="text-zinc-500">{label}</span>
      <span className={cn("font-black text-white", valueClassName)}>{value}</span>
    </div>
  );
}
