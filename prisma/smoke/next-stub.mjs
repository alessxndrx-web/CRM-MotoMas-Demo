// Stub del runtime de Next para los smokes. El motor solo lo alcanza por la
// ruta de autorización, que un script fuera de una petición HTTP no puede
// ejercitar; `revalidatePath` sí se invoca y es inofensivo como no-op.
const unavailable = () => {
  throw new Error("El runtime de Next no está disponible fuera de una petición.");
};
export const cookies = unavailable;
export const headers = unavailable;
export const redirect = unavailable;
export const notFound = unavailable;
export const revalidatePath = () => {};
export const revalidateTag = () => {};
