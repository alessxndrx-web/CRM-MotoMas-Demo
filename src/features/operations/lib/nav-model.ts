import {
  ArrowRightLeft,
  BadgeDollarSign,
  BarChart3,
  Barcode,
  BookmarkCheck,
  Boxes,
  CreditCard,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Megaphone,
  PackageSearch,
  Settings,
  ShoppingBag,
  ShoppingCart,
  UserPlus,
  UserRoundCog,
  Users,
  WalletCards,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { OperationRole } from "@/features/operations/types";

/**
 * Patch POS2.0-B — el modelo de navegación, separado de quien lo dibuja.
 *
 * Antes vivía dentro de `operations-shell.tsx`, mezclado con el JSX. Sacarlo no
 * es orden por el orden: **la barra lateral y la barra superior necesitan la
 * misma respuesta** —qué módulo está activo— y con el modelo dentro del
 * componente cada una habría acabado calculándolo por su cuenta.
 *
 * Este archivo es puro: sin `"use client"`, sin JSX, sin `usePathname`. Se puede
 * razonar sobre él leyendo, que es la única forma de confiar en un emparejador
 * de rutas.
 *
 * **No se inventó ningún módulo para llenar la navegación.** Los elementos, sus
 * rutas y sus roles son exactamente los que había.
 */

export type OperationsNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: OperationRole[];
};

/**
 * `primary` es el trabajo del usuario; `secondary` es el chasis de la
 * aplicación.
 *
 * **La distinción es visual, nunca de seguridad.** Un elemento oculto no
 * autoriza nada: la autorización vive en el servidor, en cada página y en cada
 * acción, y seguiría rechazando aunque alguien escribiera la ruta a mano.
 *
 * Soporte Técnico conserva sus pantallas en `primary` **a propósito**: para ese
 * rol el centro de soporte no es chasis, es su trabajo. Degradarlo habría sido
 * confundir «poco frecuente para la mayoría» con «secundario».
 */
export type OperationsNavGroup = {
  key: string;
  tier: "primary" | "secondary";
  items: OperationsNavItem[];
};

export const navGroups: OperationsNavGroup[] = [
  {
    key: "Inicio",
    tier: "primary",
    items: [
      {
        href: "/panel/dashboard",
        label: "Inicio",
        icon: LayoutDashboard,
        roles: ["Vendedor", "Gerente", "Administrador"],
      },
    ],
  },
  {
    key: "Gestión Comercial",
    tier: "primary",
    items: [
      {
        href: "/panel/leads",
        label: "Mis leads",
        icon: UserPlus,
        roles: ["Vendedor", "Gerente", "Administrador"],
      },
      {
        href: "/panel/clientes",
        label: "Clientes",
        icon: Users,
        roles: ["Vendedor", "Gerente", "Administrador"],
      },
      {
        href: "/panel/expedientes",
        label: "Expedientes",
        icon: FolderOpen,
        roles: ["Vendedor", "Gerente", "Administrador"],
      },
      {
        href: "/panel/actividades",
        label: "Actividades",
        icon: ListChecks,
        roles: ["Vendedor", "Gerente", "Administrador"],
      },
      {
        href: "/panel/creditos",
        label: "Créditos",
        icon: CreditCard,
        roles: ["Gerente", "Administrador"],
      },
    ],
  },
  {
    key: "Operación",
    tier: "primary",
    items: [
      {
        href: "/panel/inventario",
        label: "Inventario",
        icon: PackageSearch,
        roles: ["Vendedor", "Gerente", "Administrador"],
      },
      {
        href: "/panel/inventario/movimientos",
        label: "Movimientos de inventario",
        icon: Warehouse,
        roles: ["Gerente", "Administrador"],
      },
      {
        href: "/panel/reservas",
        label: "Reservas",
        icon: BookmarkCheck,
        roles: ["Vendedor", "Gerente", "Administrador"],
      },
      {
        href: "/panel/traslados",
        label: "Traslados",
        icon: ArrowRightLeft,
        roles: ["Vendedor", "Gerente", "Administrador"],
      },
      {
        href: "/panel/ventas",
        label: "Ventas",
        icon: BadgeDollarSign,
        roles: ["Vendedor", "Gerente", "Administrador"],
      },
    ],
  },
  {
    key: "Supervisión",
    tier: "primary",
    items: [
      {
        href: "/panel/vendedores",
        label: "Vendedores",
        icon: UserRoundCog,
        roles: ["Gerente", "Administrador"],
      },
      {
        href: "/panel/reportes",
        label: "Reportes",
        icon: BarChart3,
        roles: ["Gerente", "Administrador"],
      },
      {
        href: "/panel/marketing",
        label: "Marketing",
        icon: Megaphone,
        roles: ["Marketing", "Gerente", "Administrador"],
      },
    ],
  },
  {
    key: "Finanzas",
    tier: "primary",
    items: [
      {
        href: "/panel/contabilidad",
        label: "Contabilidad",
        icon: Landmark,
        roles: ["Contador", "Administrador", "Gerente"],
      },
      {
        href: "/panel/caja",
        label: "Caja",
        icon: WalletCards,
        roles: ["Cajero", "Administrador"],
      },
      // Patches POS1.0-B y POS1.0-C. Mismos roles que Caja porque el POS
      // reutiliza `canOperateCaja`: quien opera el mostrador es quien opera la
      // caja.
      {
        href: "/panel/pos/venta",
        label: "Punto de venta",
        icon: ShoppingCart,
        roles: ["Cajero", "Administrador"],
      },
      {
        href: "/panel/pos/productos",
        label: "Catálogo POS",
        icon: Barcode,
        roles: ["Cajero", "Administrador"],
      },
      // Patch POS2.3. Mismos roles que el mostrador porque las cinco acciones de
      // existencias usan `authorizePos` (`canOperateCaja`): mover existencias
      // del mostrador es operar el mostrador.
      {
        href: "/panel/pos/inventario",
        label: "Existencias POS",
        icon: Boxes,
        roles: ["Cajero", "Administrador"],
      },
      // Patch POS1.2-C. Compras usa `canManageInventory` (ADMIN o GERENTE), no
      // el permiso del mostrador: comprar es traer existencias, no cobrar.
      {
        href: "/panel/pos/compras",
        label: "Órdenes de compra",
        icon: ShoppingBag,
        roles: ["Gerente", "Administrador"],
      },
    ],
  },
  {
    key: "Soporte",
    tier: "primary",
    items: [
      {
        href: "/panel/soporte",
        label: "Centro de soporte",
        icon: Wrench,
        roles: ["Soporte Técnico"],
      },
      {
        href: "/panel/soporte/tickets",
        label: "Bandeja de tickets",
        icon: ListChecks,
        roles: ["Soporte Técnico"],
      },
    ],
  },
  {
    key: "Sistema",
    tier: "secondary",
    items: [
      {
        href: "/panel/configuracion",
        label: "Configuración",
        icon: Settings,
        roles: ["Gerente", "Administrador"],
      },
      {
        href: "/panel/ayuda",
        label: "Tickets y ayuda",
        icon: LifeBuoy,
        roles: [
          "Administrador",
          "Gerente",
          "Vendedor",
          "Cajero",
          "Contador",
          "Marketing",
          "Soporte Técnico",
        ],
      },
    ],
  },
];

const allHrefs = navGroups.flatMap((group) => group.items.map((item) => item.href));

/**
 * ¿Está `pathname` dentro de `href`?
 *
 * **Compara segmentos, no cadenas.** La barra final es lo que impide que
 * `/panel/ventas-antiguas` se considere dentro de `/panel/ventas`: un
 * `startsWith` a secas lo daría por bueno, y ese es exactamente el emparejador
 * frágil que no debe repetirse por los componentes.
 */
export function routeMatches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * De todas las rutas de navegación que contienen a `pathname`, la más profunda.
 *
 * `/panel/inventario/movimientos` está dentro de `/panel/inventario` y dentro de
 * sí misma; gana la segunda. **La longitud basta**: entre dos rutas que ambas
 * contienen al camino actual, la más larga es necesariamente la más específica.
 */
export function activeNavHref(pathname: string): string | null {
  let best: string | null = null;
  for (const href of allHrefs) {
    if (!routeMatches(pathname, href)) continue;
    if (!best || href.length > best.length) best = href;
  }
  return best;
}

/**
 * Todas las rutas anidadas de compras —lista, nueva y detalle— resuelven al
 * mismo módulo, que es lo que el usuario espera ver marcado.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  return activeNavHref(pathname) === href;
}

export function findNavItem(pathname: string): OperationsNavItem | null {
  const href = activeNavHref(pathname);
  if (!href) return null;
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.href === href) return item;
    }
  }
  return null;
}

export function findNavGroupKey(pathname: string): string | null {
  const href = activeNavHref(pathname);
  if (!href) return null;
  return navGroups.find((group) => group.items.some((item) => item.href === href))?.key ?? null;
}

/**
 * Ancho del contenedor de contenido, por ruta.
 *
 * **Es una lista de excepciones, no una configuración de cada pantalla.** El
 * valor por omisión —`default`, 1400px— es exactamente el que el chasis imponía
 * antes a todo el panel, así que ninguna ruta que no aparezca aquí cambia de
 * aspecto. Solo se declara la pantalla cuya densidad pide otra cosa:
 *
 * - un listado con muchas columnas quiere el ancho que haya;
 * - un formulario de captura a 1400px produce líneas ilegibles.
 *
 * Vive junto al modelo de rutas porque la respuesta depende de la ruta, y
 * ponerla en la página exigiría que el `layout` leyera datos del hijo, cosa que
 * el enrutador de Next no permite sin inventar un contexto.
 *
 * **[D]** Si la lista crece más allá de un puñado de entradas, la decisión
 * correcta pasa a ser que cada página componga su propio contenedor y el chasis
 * deje de imponer ninguno. Hoy no lo justifica.
 */
export type ContainerWidth = "wide" | "default" | "form";

const containerExceptions: Array<{ href: string; exact?: boolean; width: ContainerWidth }> = [
  // Patch POS2.0-B. Compras: el listado necesita ancho, la captura no.
  { href: "/panel/pos/compras/nueva", width: "form" },
  { href: "/panel/pos/compras", exact: true, width: "wide" },
];

export function containerWidthFor(pathname: string): ContainerWidth {
  for (const entry of containerExceptions) {
    const hit = entry.exact ? pathname === entry.href : routeMatches(pathname, entry.href);
    if (hit) return entry.width;
  }
  return "default";
}

/** El rótulo de «Mis leads» cambia para quien no vende. */
export function navLabelForRole(item: OperationsNavItem, role: OperationRole) {
  if (item.href === "/panel/leads" && role !== "Vendedor") return "Leads";
  return item.label;
}
