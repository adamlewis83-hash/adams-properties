import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PageShell, Card, Field, inputCls, btnCls } from "@/components/ui";
import { money, displayDate } from "@/lib/money";
import Link from "next/link";
import { addMonths, differenceInMonths } from "date-fns";

async function createProperty(formData: FormData) {
  "use server";
  await prisma.property.create({
    data: {
      name: String(formData.get("name")),
      address: (formData.get("address") as string) || null,
      city: (formData.get("city") as string) || "Forest Grove",
      state: (formData.get("state") as string) || "OR",
      zip: (formData.get("zip") as string) || null,
      purchasePrice: formData.get("purchasePrice") ? String(formData.get("purchasePrice")) : null,
      purchaseDate: formData.get("purchaseDate") ? new Date(String(formData.get("purchaseDate"))) : null,
      currentValue: formData.get("currentValue") ? String(formData.get("currentValue")) : null,
      downPayment: formData.get("downPayment") ? String(formData.get("downPayment")) : null,
      closingCosts: formData.get("closingCosts") ? String(formData.get("closingCosts")) : null,
      rehabCosts: formData.get("rehabCosts") ? String(formData.get("rehabCosts")) : null,
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath("/properties");
}

const TRANCHES = [
  { key: "30", label: "≤30d", days: 30, tone: "rose" as const },
  { key: "60", label: "31–60d", days: 60, tone: "amber" as const },
  { key: "90", label: "61–90d", days: 90, tone: "amber" as const },
  { key: "120", label: "91–120d", days: 120, tone: "zinc" as const },
  { key: "121", label: ">120d", days: 365, tone: "zinc" as const },
];

const TONE_CHIP: Record<"rose" | "amber" | "emerald" | "zinc", string> = {
  rose: "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 ring-1 ring-rose-200/60 dark:ring-rose-900/40",
  amber: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 ring-1 ring-amber-200/60 dark:ring-amber-900/40",
  emerald: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 ring-1 ring-emerald-200/60 dark:ring-emerald-900/40",
  zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400",
};

const ACCENTS = ["from-blue-700 to-indigo-700", "from-emerald-700 to-teal-700", "from-violet-700 to-fuchsia-700", "from-amber-700 to-orange-700", "from-rose-700 to-red-700"];

export default async function PropertiesPage() {
  const now = new Date();
  const t12Start = addMonths(now, -12);

  // Mortgage-y categories shouldn't be subtracted from NOI again — debt
  // service is its own line. Filter them out of the expense bucket.
  const MORTGAGE_CATS = new Set(["Mortgage", "Principal", "Interest", "Debt Service"]);

  const properties = await prisma.property.findMany({
    orderBy: { name: "asc" },
    include: {
      units: {
        include: {
          leases: {
            where: { status: "ACTIVE" },
            include: { tenant: true },
          },
          tickets: { where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_VENDOR"] } }, select: { id: true } },
        },
      },
      loans: { orderBy: { maturityDate: "asc" } },
      expenses: { where: { incurredAt: { gte: t12Start, lte: now } } },
    },
  });

  return (
    <PageShell title="Properties">
      {properties.length === 0 ? (
        <Card title="No properties yet">
          <p className="text-sm text-zinc-500">Add your first property below.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {properties.map((p, idx) => {
            const totalUnits = p.units.length;
            const occupiedUnits = p.units.filter((u) => u.leases.length > 0).length;
            const vacantUnits = totalUnits - occupiedUnits;
            const occupancyPct = totalUnits > 0 ? occupiedUnits / totalUnits : 0;

            const activeLeases = p.units.flatMap((u) => u.leases);
            // Annual income = lease rent + unit-level recurring add-ons (RUBS,
            // parking, storage are landlord income too).
            const annualRent = p.units.reduce((s, u) => {
              if (u.leases.length === 0) return s;
              const addOns = Number(u.rubs) + Number(u.parking) + Number(u.storage);
              const leaseRent = u.leases.reduce((ls, l) => ls + Number(l.monthlyRent), 0);
              return s + (leaseRent + addOns) * 12;
            }, 0);
            const monthlyRent = annualRent / 12;
            // T12 expenses (excluding mortgage-coded categories — debt
            // service is its own line below).
            const t12Expenses = p.expenses
              .filter((e) => !MORTGAGE_CATS.has(e.category))
              .reduce((s, e) => s + Number(e.amount), 0);
            const annualDS = p.loans.reduce((s, l) => s + Number(l.monthlyPayment) * 12, 0);
            const noi = annualRent - t12Expenses;
            const annualCF = noi - annualDS;
            const dscr = annualDS > 0 ? noi / annualDS : null;

            const value = p.currentValue ? Number(p.currentValue) : 0;
            const loanBalance = p.loans.reduce((s, l) => s + Number(l.currentBalance), 0);
            const equity = value > 0 ? Math.max(0, value - loanBalance) : 0;
            const equityPct = value > 0 ? equity / value : 0;

            const cashInvested = Number(p.downPayment ?? 0) + Number(p.closingCosts ?? 0) + Number(p.rehabCosts ?? 0);
            const coc = cashInvested > 0 ? annualCF / cashInvested : null;

            const openTickets = p.units.reduce((s, u) => s + u.tickets.length, 0);

            // Lease expiration tranches
            const tranches: Record<string, number> = { "30": 0, "60": 0, "90": 0, "120": 0, "121": 0 };
            for (const lease of activeLeases) {
              const days = Math.ceil((lease.endDate.getTime() - now.getTime()) / 86400000);
              if (days <= 30) tranches["30"]++;
              else if (days <= 60) tranches["60"]++;
              else if (days <= 90) tranches["90"]++;
              else if (days <= 120) tranches["120"]++;
              else if (days <= 365) tranches["121"]++;
            }

            // Loan maturity countdown — use the soonest-maturing loan with a date
            const nextLoan = p.loans.find((l) => l.maturityDate);
            let maturitySeverity: "high" | "med" | "low" = "low";
            let maturityLabel: string | null = null;
            if (nextLoan?.maturityDate) {
              const monthsOut = differenceInMonths(nextLoan.maturityDate, now);
              if (monthsOut <= 12) maturitySeverity = "high";
              else if (monthsOut <= 36) maturitySeverity = "med";
              const yearsOut = Math.floor(monthsOut / 12);
              const remMonths = monthsOut % 12;
              maturityLabel = monthsOut <= 0
                ? "Past due"
                : yearsOut > 0
                  ? `${yearsOut}y ${remMonths}mo`
                  : `${remMonths}mo`;
            }

            const accent = ACCENTS[idx % ACCENTS.length];
            const cfPositive = annualCF >= 0;

            return (
              <Link
                key={p.id}
                href={`/properties/${p.id}`}
                className="group relative overflow-hidden rounded-xl border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-white/80 dark:hover:bg-zinc-900/80"
              >
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${accent}`} />
                <div className="p-5 pt-6 space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold tracking-tight truncate">{p.name}</h3>
                      <div className="text-xs text-zinc-500 mt-0.5 truncate">
                        {[p.address, p.city, p.state].filter(Boolean).join(", ") || "—"}
                      </div>
                    </div>
                    <span className="text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-colors">→</span>
                  </div>

                  {/* Top metrics row */}
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="Market value" value={value > 0 ? money(value) : "—"} />
                    <Metric
                      label="Equity"
                      value={value > 0 ? money(equity) : "—"}
                      sub={value > 0 ? `${(equityPct * 100).toFixed(0)}%` : undefined}
                    />
                    <Metric
                      label="Ann. cash flow"
                      value={money(annualCF)}
                      tone={cfPositive ? "emerald" : "rose"}
                    />
                  </div>

                  {/* Occupancy */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className="text-zinc-500 uppercase tracking-wider font-medium">Occupancy</span>
                      <span className="tabular-nums">
                        <span className="font-semibold">{occupiedUnits}</span>
                        <span className="text-zinc-400">/{totalUnits}</span>
                        <span className="ml-2 text-zinc-500">{(occupancyPct * 100).toFixed(0)}%</span>
                        {vacantUnits > 0 && <span className="ml-2 text-rose-700 dark:text-rose-400">{vacantUnits} vacant</span>}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-200/70 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${accent}`}
                        style={{ width: `${(occupancyPct * 100).toFixed(1)}%` }}
                      />
                    </div>
                  </div>

                  {/* Lease expiration tranches */}
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium mb-1.5">
                      Expirations (next 12mo)
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {TRANCHES.map((t) => {
                        const count = tranches[t.key];
                        const tone = count > 0 ? t.tone : "zinc";
                        return (
                          <div
                            key={t.key}
                            className={`rounded-md px-1.5 py-1 text-center ${TONE_CHIP[tone]}`}
                          >
                            <div className="text-[9px] uppercase tracking-wider opacity-80">{t.label}</div>
                            <div className="text-sm font-semibold tabular-nums leading-tight">{count}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Loan maturity strip */}
                  {nextLoan && (
                    <div className="flex items-center justify-between text-[11px] py-1.5 px-2 rounded-md bg-zinc-50/80 dark:bg-zinc-800/50">
                      <div className="min-w-0">
                        <span className="text-zinc-500 uppercase tracking-wider font-medium mr-1.5">Loan</span>
                        <span className="font-medium">{nextLoan.lender}</span>
                      </div>
                      {maturityLabel && (
                        <div className="flex items-center gap-1.5">
                          <span className="tabular-nums text-zinc-500">
                            {nextLoan.maturityDate ? displayDate(nextLoan.maturityDate) : ""}
                          </span>
                          <span
                            className={`rounded-full px-1.5 py-0.5 font-semibold tabular-nums ${
                              maturitySeverity === "high"
                                ? TONE_CHIP.rose
                                : maturitySeverity === "med"
                                  ? TONE_CHIP.amber
                                  : TONE_CHIP.zinc
                            }`}
                          >
                            {maturityLabel}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bottom KPIs */}
                  <div className="grid grid-cols-4 gap-2 pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60">
                    <KPI label="Monthly rent" value={money(monthlyRent)} />
                    <KPI label="DSCR" value={dscr != null ? `${dscr.toFixed(2)}x` : "—"} tone={dscr != null && dscr < 1.2 ? "rose" : undefined} />
                    <KPI label="CoC" value={coc != null ? `${(coc * 100).toFixed(1)}%` : "—"} tone={coc != null && coc < 0 ? "rose" : undefined} />
                    <KPI
                      label="Tickets"
                      value={String(openTickets)}
                      tone={openTickets > 0 ? "amber" : undefined}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Card title="Add Property">
        <form action={createProperty} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <Field label="Name"><input name="name" required className={inputCls} placeholder="Pine Street Apartments" /></Field>
          <Field label="Address"><input name="address" className={inputCls} /></Field>
          <Field label="City"><input name="city" defaultValue="Forest Grove" className={inputCls} /></Field>
          <div className="flex gap-2">
            <div className="w-16"><Field label="State"><input name="state" defaultValue="OR" className={inputCls} /></Field></div>
            <div className="flex-1"><Field label="ZIP"><input name="zip" className={inputCls} /></Field></div>
          </div>
          <Field label="Purchase price"><input name="purchasePrice" type="number" step="0.01" className={inputCls} /></Field>
          <Field label="Purchase date"><input name="purchaseDate" type="date" className={inputCls} /></Field>
          <Field label="Current value"><input name="currentValue" type="number" step="0.01" className={inputCls} /></Field>
          <Field label="Down payment"><input name="downPayment" type="number" step="0.01" className={inputCls} /></Field>
          <Field label="Closing costs"><input name="closingCosts" type="number" step="0.01" className={inputCls} /></Field>
          <Field label="Rehab costs"><input name="rehabCosts" type="number" step="0.01" className={inputCls} /></Field>
          <div className="md:col-span-2">
            <Field label="Notes"><input name="notes" className={inputCls} /></Field>
          </div>
          <button type="submit" className={btnCls}>Add</button>
        </form>
      </Card>
    </PageShell>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "emerald" | "rose" }) {
  const valueCls = tone === "emerald" ? "text-emerald-700 dark:text-emerald-400" : tone === "rose" ? "text-rose-700 dark:text-rose-400" : "";
  return (
    <div className="rounded-lg bg-zinc-50/80 dark:bg-zinc-800/50 p-2.5">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold truncate">{label}</div>
      <div className={`text-base font-bold mt-0.5 tabular-nums truncate ${valueCls}`}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-500 tabular-nums">{sub}</div>}
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "rose" | "amber" }) {
  const valueCls = tone === "emerald"
    ? "text-emerald-700 dark:text-emerald-400"
    : tone === "rose"
      ? "text-rose-700 dark:text-rose-400"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : "";
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${valueCls}`}>{value}</div>
    </div>
  );
}
