import { cn } from "@/lib/utils";

export function BrandWordmark({
  className,
  subtitle,
  tone = "dark",
}: {
  className?: string;
  subtitle?: string;
  tone?: "dark" | "light";
}) {
  const onDark = tone === "dark";
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span
        className={cn(
          "text-3xl font-semibold leading-none tracking-tight",
          onDark ? "text-white" : "text-slate-900",
        )}
      >
        Moto<span className="text-orange-500">Mas</span>
      </span>
      <span aria-hidden className="brand-rule h-0.5 w-14 rounded-full" />
      {subtitle ? (
        <span
          className={cn(
            "text-xs font-semibold uppercase tracking-wider",
            onDark ? "text-slate-300" : "text-slate-500",
          )}
        >
          {subtitle}
        </span>
      ) : null}
    </div>
  );
}
