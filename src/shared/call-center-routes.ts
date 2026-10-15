/** Call Center's global commercial scope must not open supervisory or financial screens. */
export function isCallCenterRoute(pathname: string): boolean {
  return ["/panel/leads","/panel/clientes","/panel/expedientes","/panel/inventario","/panel/reservas","/panel/actividades","/panel/ayuda","/panel/configuracion/apariencia"].some(path=>pathname===path || pathname.startsWith(`${path}/`));
}
