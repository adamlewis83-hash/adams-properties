import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { money, displayDate } from "@/lib/money";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { MaintForm } from "./maint-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  try {
    const lease = await prisma.lease.findUnique({
      where: { portalToken: token },
      include: { unit: { include: { property: { select: { name: true } } } } },
    });
    if (!lease) return { title: "Tenant portal" };
    const propertyName = lease.unit.property?.name ?? "Tenant portal";
    const title = `${propertyName} — Unit ${lease.unit.label}`;
    return {
      title,
      description: `Tenant portal for ${propertyName}, Unit ${lease.unit.label}.`,
      openGraph: { title, description: `Tenant portal for ${propertyName}, Unit ${lease.unit.label}.` },
    };
  } catch {
    return { title: "Tenant portal" };
  }
}

// Ticket status → tenant-friendly chip + timeline per the prototype:
// Submitted → Manager review → Vendor assigned → Done.
function ticketDisplay(status: string): { chip: string; chipColor: string; chipBg: string; timeline: string } {
  switch (status) {
    case "WAITING_VENDOR":
      return {
        chip: "VENDOR ASSIGNED",
        chipColor: "var(--slate)",
        chipBg: "rgba(61,90,128,0.12)",
        timeline: "Submitted → Manager review → Vendor assigned",
      };
    case "IN_PROGRESS":
      return {
        chip: "IN PROGRESS",
        chipColor: "var(--slate)",
        chipBg: "rgba(61,90,128,0.12)",
        timeline: "Submitted → Manager review → Vendor assigned → In progress",
      };
    default:
      return {
        chip: "SUBMITTED",
        chipColor: "var(--amber)",
        chipBg: "rgba(192,122,30,0.13)",
        timeline: "Submitted → Manager review → Vendor assigned",
      };
  }
}

export default async function TenantPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lease = await prisma.lease.findUnique({
    where: { portalToken: token },
    include: {
      unit: {
        include: {
          property: { select: { name: true } },
          tickets: {
            where: { status: { not: "COMPLETED" } },
            orderBy: { openedAt: "desc" },
          },
        },
      },
      tenant: true,
      charges: { orderBy: { dueDate: "asc" } },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });
  if (!lease) notFound();
  const propertyName = lease.unit.property?.name ?? "Your property";

  const totalCharges = lease.charges.reduce((s, c) => s + Number(c.amount), 0);
  const totalPaid = lease.payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = totalCharges - totalPaid;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthLabel = format(now, "MMMM");
  const monthCharges = lease.charges
    .filter((c) => c.dueDate >= monthStart && c.dueDate <= monthEnd)
    .reduce((s, c) => s + Number(c.amount), 0);
  const monthPaid = lease.payments
    .filter((p) => p.paidAt >= monthStart && p.paidAt <= monthEnd)
    .reduce((s, p) => s + Number(p.amount), 0);
  const monthSettled = monthCharges > 0 && monthPaid >= monthCharges;

  const initials = `${lease.tenant.firstName?.[0] ?? ""}${lease.tenant.lastName?.[0] ?? ""}`.toUpperCase() || "T";
  const recentPayments = lease.payments.slice(0, 8);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="max-w-md mx-auto px-4 py-8 flex flex-col gap-5">
        {/* header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12.5px] text-[var(--muted-fg)]">
              {propertyName} · Unit {lease.unit.label}
            </span>
            <span className="serif text-2xl text-[var(--brand-navy)] dark:text-white">
              Hi, {lease.tenant.firstName}
            </span>
          </div>
          <div className="w-10 h-10 rounded-full bg-[var(--brand-navy)] flex items-center justify-center font-bold text-[var(--brand-gold-soft)] text-sm">
            {initials}
          </div>
        </div>

        {/* rent card */}
        <div className="bg-[var(--brand-navy)] text-white rounded-3xl p-6 flex flex-col gap-4">
          <span className="text-[12.5px]" style={{ color: "#b9c2d4" }}>
            {balance > 0 ? `Balance due · ${monthLabel}` : `${monthLabel} rent`}
          </span>
          <span
            className="money text-[42px] font-medium tracking-tight leading-none"
            style={{ color: balance > 0 ? "#fff" : "#7fd4ab" }}
          >
            {money(Math.max(0, balance))}
          </span>
          {balance > 0 ? (
            <>
              <a
                href={`/api/checkout?leaseId=${lease.id}`}
                className="block text-center font-bold text-[15px] py-3.5 rounded-2xl transition-colors"
                style={{ background: "var(--brand-gold)", color: "var(--brand-navy)" }}
              >
                Pay now
              </a>
              <span className="text-[11.5px] text-center" style={{ color: "#b9c2d4" }}>
                Bank transfer · no fee &nbsp;·&nbsp; card +2.9%
              </span>
            </>
          ) : (
            <div
              className="text-center text-sm font-semibold rounded-2xl py-3"
              style={{ color: "#7fd4ab", background: "rgba(29,122,79,0.25)" }}
            >
              ✓ {monthSettled ? "Paid — thank you!" : "All paid up — thank you!"}
            </div>
          )}
        </div>

        {/* quick actions */}
        <div className="grid grid-cols-2 gap-2.5">
          <a
            href="#maintenance"
            className="text-left bg-[var(--paper)] border border-[var(--rule)] rounded-2xl p-4 flex flex-col gap-1.5 hover:border-[var(--brand-gold)] transition-colors"
          >
            <span className="text-xl" aria-hidden>🔧</span>
            <span className="text-[13.5px] font-semibold">Report an issue</span>
          </a>
          <a
            href="#lease"
            className="text-left bg-[var(--paper)] border border-[var(--rule)] rounded-2xl p-4 flex flex-col gap-1.5 hover:border-[var(--brand-gold)] transition-colors"
          >
            <span className="text-xl" aria-hidden>📄</span>
            <span className="text-[13.5px] font-semibold">My lease</span>
          </a>
        </div>

        {/* open requests */}
        {lease.unit.tickets.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="money text-[11px] tracking-[0.1em] uppercase text-[var(--muted-fg)]">Open requests</span>
            {lease.unit.tickets.map((t) => {
              const d = ticketDisplay(t.status);
              return (
                <div
                  key={t.id}
                  className="bg-[var(--paper)] border border-[var(--rule)] rounded-2xl px-4 py-3.5 flex flex-col gap-2"
                >
                  <div className="flex justify-between items-center gap-2.5">
                    <span className="text-[13.5px] font-semibold min-w-0 truncate">{t.title}</span>
                    <span
                      className="text-[10.5px] font-bold px-2.5 py-0.5 rounded-full shrink-0"
                      style={{ color: d.chipColor, background: d.chipBg }}
                    >
                      {d.chip}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--muted-fg)] leading-relaxed">
                    Opened {displayDate(t.openedAt)} · {d.timeline}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* payment history */}
        <div className="flex flex-col gap-2.5">
          <span className="money text-[11px] tracking-[0.1em] uppercase text-[var(--muted-fg)]">Payment history</span>
          {recentPayments.length === 0 ? (
            <p className="text-sm text-[var(--muted-fg)]">No payments yet.</p>
          ) : (
            recentPayments.map((p) => (
              <div key={p.id} className="flex justify-between items-center text-[13px]">
                <div className="flex flex-col">
                  <span className="font-semibold">{format(p.paidAt, "MMMM")} rent</span>
                  <span className="text-[11.5px] text-[var(--muted-fg)]">
                    Paid {displayDate(p.paidAt)} · {p.method.toLowerCase().replace("_", " ")}
                  </span>
                </div>
                <span className="money" style={{ color: "var(--pine)" }}>
                  {money(p.amount)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* maintenance */}
        <div id="maintenance" className="bg-[var(--paper)] border border-[var(--rule)] rounded-3xl p-5 flex flex-col gap-4 scroll-mt-4">
          <span className="serif text-xl text-[var(--brand-navy)] dark:text-white">New request</span>
          <MaintForm token={token} />
        </div>

        {/* lease details */}
        <div id="lease" className="bg-[var(--paper)] border border-[var(--rule)] rounded-3xl p-5 flex flex-col gap-3 scroll-mt-4">
          <span className="serif text-xl text-[var(--brand-navy)] dark:text-white">My lease</span>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-[var(--muted-fg)]">Unit</dt>
              <dd className="mt-0.5 font-semibold">{lease.unit.label}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-[var(--muted-fg)]">Term</dt>
              <dd className="mt-0.5">{displayDate(lease.startDate)} → {displayDate(lease.endDate)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-[var(--muted-fg)]">Monthly rent</dt>
              <dd className="mt-0.5 money">{money(lease.monthlyRent)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-[var(--muted-fg)]">Deposit</dt>
              <dd className="mt-0.5 money">{money(lease.securityDeposit)}</dd>
            </div>
          </dl>
        </div>

        <p className="text-xs text-[var(--muted-fg)] text-center pb-6">
          Questions? Contact your property manager.
        </p>
      </div>
    </div>
  );
}
