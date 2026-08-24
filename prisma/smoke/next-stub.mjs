// Stub del runtime de Next para los smokes. El motor solo lo alcanza por la
// ruta de autorización, que un script fuera de una petición HTTP no puede
// ejercitar; `revalidatePath` sí se invoca y es inofensivo como no-op.
//
// `cookies` sigue lanzando por omisión — un smoke que la alcanza sin querer
// tiene que enterarse. Un smoke que SÍ quiere ejercitar una Server Action
// autenticada inyecta su cookie firmada en `globalThis.__motomasSmokeCookies`
// antes de llamarla (ver prisma/smoke/meta1-webhook-leadads.ts). Sigue siendo
// una sesión real, firmada con el mismo secreto y verificada por el mismo
// código: lo que se sustituye es el transporte, no la autorización.
const unavailable = () => {
  throw new Error("El runtime de Next no está disponible fuera de una petición.");
};

export const cookies = async () => {
  const injected = globalThis.__motomasSmokeCookies;
  if (!injected) unavailable();
  return {
    get: (name) =>
      name in injected ? { name, value: injected[name] } : undefined,
  };
};

export const headers = unavailable;
export const redirect = unavailable;
export const notFound = unavailable;
export const revalidatePath = () => {};
export const revalidateTag = () => {};
