import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { TicketSummaryDTO } from "@/server/tickets/types";
import {
  formatTicketDate,
  ticketCategoryLabels,
  ticketImpactLabels,
  ticketImpactTone,
  ticketStatusLabels,
  ticketStatusTone,
} from "@/features/operations/modules/tickets/ticket-ui";

export function TicketStatusBadge({ ticket }: { ticket: TicketSummaryDTO }) {
  return (
    <Badge tone={ticketStatusTone[ticket.status]}>
      {ticketStatusLabels[ticket.status]}
    </Badge>
  );
}

export function TicketImpactBadge({ ticket }: { ticket: TicketSummaryDTO }) {
  return (
    <Badge tone={ticketImpactTone[ticket.impact]}>
      {ticketImpactLabels[ticket.impact]}
    </Badge>
  );
}

export function TicketSummaryCard({ ticket }: { ticket: TicketSummaryDTO }) {
  return (
    <Card className="p-5 transition-colors hover:border-blue-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            className="font-mono text-xs font-semibold text-blue-700 hover:text-blue-800"
            href={`/panel/ayuda/tickets/${encodeURIComponent(ticket.code)}`}
          >
            {ticket.code}
          </Link>
          <h3 className="mt-1 truncate text-base font-semibold text-slate-900">
            {ticket.title}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {ticketCategoryLabels[ticket.category]}
            {ticket.branch ? ` · ${ticket.branch.name}` : ""}
          </p>
        </div>
        <TicketStatusBadge ticket={ticket} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <TicketImpactBadge ticket={ticket} />
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Clock3 className="h-3.5 w-3.5" />
            {formatTicketDate(ticket.updatedAt, true)}
          </span>
        </div>
        <Link
          aria-label={`Abrir ${ticket.code}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-800"
          href={`/panel/ayuda/tickets/${encodeURIComponent(ticket.code)}`}
        >
          Ver ticket
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}
