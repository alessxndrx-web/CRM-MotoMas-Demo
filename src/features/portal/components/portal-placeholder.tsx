import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type PortalPlaceholderProps = {
  title: string;
  description: string;
  eyebrow?: string;
};

export function PortalPlaceholder({
  title,
  description,
  eyebrow = "Portal Cliente",
}: PortalPlaceholderProps) {
  return (
    <section className="mx-auto max-w-[980px] px-4 py-12 sm:px-8 lg:px-10">
      <Card className="overflow-hidden p-8">
        <Badge tone="red">{eyebrow}</Badge>
        <h1 className="mt-5 text-3xl font-black tracking-normal text-white sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
          {description}
        </p>
        <Link
          className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(239,35,45,0.24)] transition hover:bg-red-500"
          href="/"
        >
          Volver al Portal
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Card>
    </section>
  );
}
