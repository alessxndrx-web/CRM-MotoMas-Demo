export const PENDING_INFO = "Información pendiente de completar";

export type Role = "admin" | "gerente" | "vendedor";
export type View =
  | "dashboard"
  | "inventario"
  | "clientes"
  | "expediente"
  | "creditos"
  | "traslados"
  | "vendedores"
  | "reportes";

export type MotoStatus = "Disponible" | "Stock Bajo" | "Alta Demanda" | "Critico";
export type ClientStatus =
  | "Evaluacion credito"
  | "Reserva confirmada"
  | "Documentacion"
  | "Entrega pendiente";
export type CreditStatus = "Pendiente" | "Aprobado" | "Observado" | "Rechazado";

export type Motorcycle = {
  id: string;
  name: string;
  sourceFolder: string;
  sku: string | null;
  category: string | null;
  specs: string | null;
  image: string | null;
  images: string[];
  price: number | null;
  colors: string[];
  versions: string[];
};

export type Branch = {
  id: string;
  name: string;
  city: string;
};

export type Seller = {
  id: string;
  name: string;
  branchId: string;
  role: Role;
  avatar: string;
  active: boolean;
  deals: number;
  quotes: number;
  satisfaction: number;
};

export type Quote = {
  id: string;
  branchId: string;
  sellerId: string;
  motorcycleId: string;
  createdAt: string;
  amount: number | null;
  status: "Abierta" | "Reservada" | "Ganada";
};

export type Client = {
  id: string;
  name: string;
  document: string;
  city: string;
  avatar: string;
  status: ClientStatus;
  motorcycleId: string;
  financial: string;
  sellerId: string;
  branchId: string;
  quotes: Quote[];
  lastContact: string;
};

export type Credit = {
  id: string;
  clientId: string;
  motorcycleId: string;
  financial: string;
  status: CreditStatus;
  score: number;
  amount: number | null;
  branchId: string;
};

export type InventoryItem = {
  fisico: number;
  reservadas: number;
  vendidasMes: number;
  creditosActivos: number;
};

export type TransferOrder = {
  id: string;
  motorcycleId: string;
  fromBranchId: string;
  toBranchId: string;
  quantity: number;
  status: "Completada" | "En ruta" | "Pendiente";
  createdAt: string;
  requestedBy: string;
};

export type Activity = {
  id: string;
  type: "Aprobado" | "Reserva" | "Documentos" | "Venta" | "Traslado";
  title: string;
  detail: string;
  minutes: number;
};

export type AppState = {
  clients: Client[];
  credits: Credit[];
  inventory: Record<string, Record<string, InventoryItem>>;
  transferOrders: TransferOrder[];
  activities: Activity[];
};

export const branches: Branch[] = [
  { id: "bello-horizonte", name: "Bello Horizonte", city: "" },
  { id: "bonanza", name: "Bonanza", city: "" },
  { id: "ciudad-sandino", name: "Ciudad Sandino", city: "" },
  { id: "masaya", name: "Masaya", city: "" },
  { id: "mercedes", name: "Mercedes", city: "" },
  { id: "central", name: "Central", city: "" },
  { id: "multicentro", name: "Multicentro", city: "" },
  { id: "rosita", name: "Rosita", city: "" },
  { id: "suburbana", name: "Suburbana", city: "" },
  { id: "granada", name: "Granada", city: "" },
  { id: "carretera-masaya", name: "Carretera Masaya", city: "" },
  { id: "coyotepe", name: "Coyotepe", city: "" },
];

export const sellers: Seller[] = [
  {
    id: "alejandro",
    name: "Alejandro M.",
    branchId: "central",
    role: "admin",
    avatar: "",
    active: true,
    deals: 28,
    quotes: 84,
    satisfaction: 96,
  },
  {
    id: "roberto",
    name: "Roberto M.",
    branchId: "central",
    role: "vendedor",
    avatar: "",
    active: true,
    deals: 18,
    quotes: 52,
    satisfaction: 91,
  },
  {
    id: "ana",
    name: "Ana L.",
    branchId: "ciudad-sandino",
    role: "vendedor",
    avatar: "",
    active: true,
    deals: 23,
    quotes: 69,
    satisfaction: 94,
  },
  {
    id: "marco",
    name: "Marco R.",
    branchId: "bello-horizonte",
    role: "gerente",
    avatar: "",
    active: true,
    deals: 31,
    quotes: 77,
    satisfaction: 97,
  },
  {
    id: "laura",
    name: "Laura Q.",
    branchId: "bonanza",
    role: "vendedor",
    avatar: "",
    active: true,
    deals: 15,
    quotes: 44,
    satisfaction: 90,
  },
  {
    id: "diego",
    name: "Diego S.",
    branchId: "mercedes",
    role: "vendedor",
    avatar: "",
    active: true,
    deals: 20,
    quotes: 58,
    satisfaction: 92,
  },
  {
    id: "sofia",
    name: "Sofia P.",
    branchId: "multicentro",
    role: "vendedor",
    avatar: "",
    active: false,
    deals: 9,
    quotes: 30,
    satisfaction: 88,
  },
  {
    id: "esteban",
    name: "Esteban V.",
    branchId: "rosita",
    role: "vendedor",
    avatar: "",
    active: true,
    deals: 17,
    quotes: 49,
    satisfaction: 93,
  },
];

const inventoryFallback: InventoryItem = {
  fisico: 0,
  reservadas: 0,
  vendidasMes: 0,
  creditosActivos: 0,
};

const clientSeeds = [
  {
    id: "exp-2024-0891",
    name: "Juan Perez",
    document: "1-0888-0421",
    city: "San Jose, Costa Rica",
    avatar: "",
    status: "Evaluacion credito" as const,
    financial: "MongePay",
    sellerId: "roberto",
    branchId: "central",
    lastContact: "hace 10 min",
  },
  {
    id: "exp-2024-0712",
    name: "Maria Garcia",
    document: "2-0450-1138",
    city: "Cartago, Costa Rica",
    avatar: "",
    status: "Reserva confirmada" as const,
    financial: "Contado",
    sellerId: "ana",
    branchId: "ciudad-sandino",
    lastContact: "hace 12 min",
  },
  {
    id: "exp-2024-0902",
    name: "Luis Torres",
    document: "1-1289-0045",
    city: "Heredia, Costa Rica",
    avatar: "",
    status: "Documentacion" as const,
    financial: "Credifacil",
    sellerId: "diego",
    branchId: "mercedes",
    lastContact: "hace 45 min",
  },
  {
    id: "exp-2024-1002",
    name: "Carlos Mendez",
    document: "2-0901-1110",
    city: "Alajuela, Costa Rica",
    avatar: "",
    status: "Entrega pendiente" as const,
    financial: "Credifacil",
    sellerId: "ana",
    branchId: "bello-horizonte",
    lastContact: "hace 1 hora",
  },
  {
    id: "exp-2024-1142",
    name: "Elena Vargas",
    document: "1-1190-0921",
    city: "Escazu, Costa Rica",
    avatar: "",
    status: "Evaluacion credito" as const,
    financial: "MongePay",
    sellerId: "laura",
    branchId: "bonanza",
    lastContact: "hace 2 horas",
  },
];

function pickMotorcycle(motorcycles: Motorcycle[], index: number) {
  if (!motorcycles.length) return null;
  return motorcycles[index % motorcycles.length];
}

function createQuote(
  seedId: string,
  motorcycle: Motorcycle,
  branchId: string,
  sellerId: string,
  status: Quote["status"] = "Abierta",
): Quote {
  return {
    id: `q-${seedId}`,
    branchId,
    sellerId,
    motorcycleId: motorcycle.id,
    createdAt: "2024-10-14",
    amount: motorcycle.price,
    status,
  };
}

function createClients(motorcycles: Motorcycle[]): Client[] {
  if (!motorcycles.length) return [];

  return clientSeeds.map((seed, index) => {
    const motorcycle = pickMotorcycle(motorcycles, index)!;
    const quote = createQuote(
      seed.id.replace("exp-", "").toLowerCase(),
      motorcycle,
      seed.branchId,
      seed.sellerId,
      seed.status === "Reserva confirmada" ? "Reservada" : "Abierta",
    );

    return {
      ...seed,
      motorcycleId: motorcycle.id,
      quotes: [quote],
    };
  });
}

function createCredits(clients: Client[], motorcycles: Motorcycle[]): Credit[] {
  const scores = [742, 688, 721, 760, 704];
  const statuses: CreditStatus[] = [
    "Pendiente",
    "Observado",
    "Pendiente",
    "Aprobado",
    "Pendiente",
  ];

  return clients
    .filter((client) => client.financial !== "Contado")
    .map((client, index) => {
      const motorcycle = motorcycles.find((item) => item.id === client.motorcycleId);
      return {
        id: `cr-${8390 + index}`,
        clientId: client.id,
        motorcycleId: client.motorcycleId,
        financial: client.financial,
        status: statuses[index] ?? "Pendiente",
        score: scores[index] ?? 700,
        amount: motorcycle?.price ?? null,
        branchId: client.branchId,
      };
    });
}

export function createInventory(
  motorcycles: Motorcycle[],
): Record<string, Record<string, InventoryItem>> {
  return branches.reduce<Record<string, Record<string, InventoryItem>>>(
    (acc, branch, branchIndex) => {
      acc[branch.id] = motorcycles.reduce<Record<string, InventoryItem>>(
        (items, motorcycle, motoIndex) => {
          const base = [42, 15, 28, 10][motoIndex] ?? 18;
          items[motorcycle.id] = {
            fisico: Math.max(4, base - branchIndex + (motoIndex % 2) * 3),
            reservadas: [5, 3, 2, 4][motoIndex] ?? 1,
            vendidasMes: [120, 45, 210, 30][motoIndex] ?? 24,
            creditosActivos: [12, 8, 5, 6][motoIndex] ?? 2,
          };
          return items;
        },
        {},
      );
      return acc;
    },
    {},
  );
}

function createTransferOrders(motorcycles: Motorcycle[]): TransferOrder[] {
  const first = pickMotorcycle(motorcycles, 0);
  const second = pickMotorcycle(motorcycles, 1);

  return [first, second]
    .filter((motorcycle): motorcycle is Motorcycle => Boolean(motorcycle))
    .map((motorcycle, index) => ({
      id: `ot-${1048 - index}`,
      motorcycleId: motorcycle.id,
      fromBranchId: index === 0 ? "central" : "bello-horizonte",
      toBranchId: index === 0 ? "ciudad-sandino" : "bonanza",
      quantity: index === 0 ? 4 : 2,
      status: index === 0 ? "En ruta" : "Completada",
      createdAt: index === 0 ? "2024-10-14" : "2024-10-13",
      requestedBy: index === 0 ? "Alejandro M." : "Marco R.",
    }));
}

function createActivities(clients: Client[], motorcycles: Motorcycle[]): Activity[] {
  const firstMotorcycle = pickMotorcycle(motorcycles, 0);
  const reservedClient = clients.find(
    (client) => client.status === "Reserva confirmada",
  );
  const approvedClient = clients.find(
    (client) => client.status === "Entrega pendiente",
  );

  return [
    {
      id: "act-1",
      type: "Aprobado",
      title: "Credito aprobado",
      detail: approvedClient
        ? `Cliente: ${approvedClient.name}`
        : PENDING_INFO,
      minutes: 5,
    },
    {
      id: "act-2",
      type: "Reserva",
      title: "Nueva reserva registrada",
      detail:
        reservedClient && firstMotorcycle
          ? `${branchName(reservedClient.branchId)} - ${firstMotorcycle.name}`
          : PENDING_INFO,
      minutes: 12,
    },
    {
      id: "act-3",
      type: "Documentos",
      title: "Documentos recibidos",
      detail: clients[0] ? `${clients[0].id.toUpperCase()} actualizado` : PENDING_INFO,
      minutes: 45,
    },
    {
      id: "act-4",
      type: "Venta",
      title: "Venta completada",
      detail: "Entrega programada: Manana",
      minutes: 60,
    },
  ];
}

export function createInitialAppState(motorcycles: Motorcycle[]): AppState {
  const clients = createClients(motorcycles);
  return {
    clients,
    credits: createCredits(clients, motorcycles),
    inventory: createInventory(motorcycles),
    transferOrders: createTransferOrders(motorcycles),
    activities: createActivities(clients, motorcycles),
  };
}

export function normalizeAppStateForCatalog(
  state: AppState,
  initialState: AppState,
  motorcycles: Motorcycle[],
): AppState {
  const motorcycleIds = new Set(motorcycles.map((motorcycle) => motorcycle.id));
  const inventory = branches.reduce<Record<string, Record<string, InventoryItem>>>(
    (acc, branch) => {
      const currentBranch = state.inventory?.[branch.id] ?? {};
      const initialBranch = initialState.inventory?.[branch.id] ?? {};
      acc[branch.id] = motorcycles.reduce<Record<string, InventoryItem>>(
        (items, motorcycle) => {
          items[motorcycle.id] =
            currentBranch[motorcycle.id] ??
            initialBranch[motorcycle.id] ??
            inventoryFallback;
          return items;
        },
        {},
      );
      return acc;
    },
    {},
  );

  const clients = state.clients
    .filter((client) => motorcycleIds.has(client.motorcycleId))
    .map((client) => ({
      ...client,
      quotes: client.quotes.filter((quote) => motorcycleIds.has(quote.motorcycleId)),
    }));

  const clientIds = new Set(clients.map((client) => client.id));

  return {
    clients,
    credits: state.credits.filter(
      (credit) =>
        clientIds.has(credit.clientId) && motorcycleIds.has(credit.motorcycleId),
    ),
    inventory,
    transferOrders: state.transferOrders.filter((order) =>
      motorcycleIds.has(order.motorcycleId),
    ),
    activities: state.activities,
  };
}

export function branchName(id: string) {
  return branches.find((branch) => branch.id === id)?.name ?? id;
}

export function getMotorcycleName(motorcycles: Motorcycle[], id: string) {
  return motorcycles.find((motorcycle) => motorcycle.id === id)?.name ?? PENDING_INFO;
}

export function sellerName(id: string) {
  return sellers.find((seller) => seller.id === id)?.name ?? id;
}

export function formatCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return PENDING_INFO;

  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0,
  }).format(value);
}
