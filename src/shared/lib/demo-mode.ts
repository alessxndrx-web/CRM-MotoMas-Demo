export function isDemoDataEnabled() {
  if (process.env.NEXT_PUBLIC_MOTOMAS_ENABLE_DEMO_DATA === "true") return true;
  if (process.env.NEXT_PUBLIC_MOTOMAS_ENABLE_DEMO_DATA === "false") return false;
  return process.env.NODE_ENV !== "production";
}
