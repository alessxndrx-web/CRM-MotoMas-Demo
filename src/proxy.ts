import { NextResponse, type NextRequest } from "next/server";

import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/server/auth/session";

/**
 * Patch POS2.4. El cobro y las existencias del mostrador se mudaron a `/pos/*`,
 * detrás de la sesión de POS. Sus URLs antiguas siguen funcionando.
 *
 * **La redirección va aquí y no en una página.** Todo `/panel/*` pasa antes por
 * la comprobación de sesión administrativa de abajo, así que un operador de
 * mostrador con un marcador antiguo acababa en el login del panel — que es
 * justo donde no debe ir. En el borde, la URL se traslada antes de que ninguna
 * autorización administrativa opine.
 */
const MOVED_TO_POS: Record<string, string> = {
  "/panel/pos/venta": "/pos/venta",
  "/panel/pos/inventario": "/pos/inventario",
};

export async function proxy(request: NextRequest) {
  const moved = MOVED_TO_POS[request.nextUrl.pathname];
  if (moved) {
    const url = request.nextUrl.clone();
    url.pathname = moved;
    url.search = "";
    return NextResponse.redirect(url);
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/panel/:path*"],
};
