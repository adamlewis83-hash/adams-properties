import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageShell, Card, Field, inputCls, btnCls, btnDanger } from "@/components/ui";
import { money, isoDate, displayDate } from "@/lib/money";
import { cashOnCash, estimatedEquity, irr, formatPct } from "@/lib/finance";
import { startOfYear, endOfYear, differenceInCalendarYears, addMonths } from "date-fns";
import { EditProperty } from "./edit-property";
import { SortHeader } from "@/components/sort-header";
import { parseSortParams, sortRows } from "@/lib/sort";
import { requireAppUser } from "@/lib/auth";
import { DocumentsCard } from "@/components/documents-card";
import { OwnerStatementButton } from "@/components/owner-statement-button";
import { CommentThread } from "@/components/comment-thread";
import { fetchComments } from "@/lib/comments";

async function addLoan(formData: FormData) {
  "use server";
  const propertyId = String(formData.get("propertyId"));
  await prisma.loan.create({
    data: {
      propertyId,
      lender: String(formData.get("lender")),
      originalAmount: String(formData.get("originalAmount")),
      currentBalance: String(formData.get("currentBalance")),
      interestRate: String(formData.get("interestRate")),
      termMonths: Number(formData.get("termMonths")),
      monthlyPayment: String(formData.get("monthlyPayment")),
      startDate: new Date(String(formData.get("startDate"))),
      maturityDate: formData.get("maturityDate") ? new Date(String(formData.get("maturityDate"))) : null,
      loanType: (formData.get("loanType") as string) || "Fixed",
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath(`/properties/${propertyId}`);
}

async function deleteLoan(formData: FormData) {
  "use server";
  const propertyId = String(formData.get("propertyId"));
  await prisma.loan.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath(`/properties/${propertyId}`);
}

async function addDistribution(formData: FormData) {
  "use server";
  const propertyId = String(formData.get("propertyId"));
  await prisma.distribution.create({
    data: {
      propertyId,
      paidAt: new Date(String(formData.get("paidAt"))),
      amount: String(formData.get("amount")),
      kind: (formData.get("kind") as string) || "Distribution",
      memo: (formData.get("memo") as string) || null,
    },
  });
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/analytics");
}

async function deleteDistribution(formData: FormData) {
  "use server";
  const propertyId = String(formData.get("propertyId"));
  await prisma.distribution.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/analytics");
}

async function addLoanPayment(formData: FormData) {
  "use server";
  const loanId = String(formData.get("loanId"));
  const propertyId = String(formData.get("propertyId"));
  const principal = Number(formData.get("principal"));

  await prisma.loanPayment.create({
    data: {
      loanId,
      paidAt: new Date(String(formData.get("paidAt"))),
      totalAmount: String(formData.get("totalAmount")),
      principal: String(formData.get("principal")),
      interest: String(formData.get("interest")),
      escrow: formData.get("escrow") ? String(formData.get("escrow")) : null,
      memo: (formData.get("memo") as string) || null,
    },
  });

  await prisma.loan.update({
    where: { id: loanId },
    data: { currentBalance: { decrement: principal } },
  });

  revalidatePath(`/properties/${propertyId}`);
}

async function addRecurring(formData: FormData) {
  "use server";
  const propertyId = String(formData.get("propertyId"));
  await prisma.recurringExpense.create({
    data: {
      propertyId,
      category: String(formData.get("category")),
      amount: String(formData.get("amount")),
      vendor: (formData.get("vendor") as string) || null,
      memo: (formData.get("memo") as string) || null,
      dayOfMonth: Math.min(28, Math.max(1, Number(formData.get("dayOfMonth") ?? 1))),
      startDate: new Date(String(formData.get("startDate"))),
      endDate: formData.get("endDate") ? new Date(String(formData.get("endDate"))) : null,
    },
  });
  revalidatePath(`/properties/${propertyId}`);
}

async function deleteRecurring(formData: FormData) {
  "use server";
  const propertyId = String(formData.get("propertyId"));
  await prisma.recurringExpense.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath(`/properties/${propertyId}`);
}

async function toggleRecurring(formData: FormData) {
  "use server";
  const propertyId = String(formData.get("propertyId"));
  const id = String(formData.get("id"));
  const next = formData.get("active") === "true";
  await prisma.recurringExpense.update({ where: { id }, data: { active: next } });
  revalidatePath(`/properties/${propertyId}`);
}

async function addCapEx(formData: FormData) {
  "use server";
  const propertyId = String(formData.get("propertyId"));
  await prisma.capitalImprovement.create({
    data: {
      propertyId,
      category: String(formData.get("category")),
      description: String(formData.get("description")),
      amount: String(formData.get("amount")),
      placedInService: new Date(String(formData.get("placedInService"))),
      usefulLifeYears: Math.max(1, Math.min(99, Number(formData.get("usefulLifeYears") ?? 27))),
      vendor: (formData.get("vendor") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath(`/properties/${propertyId}`);
}

async function deleteCapEx(formData: FormData) {
  "use server";
  const propertyId = String(formData.get("propertyId"));
  await prisma.capitalImprovement.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath(`/properties/${propertyId}`);
}

export default async function PropertyDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const user = await requireAppUser();
  if (!user.isAdmin && !user.membershipPropertyIds.includes(id)) notFound();
  const sp = await searchParams;
  const { field: sortField, dir: sortDir } = parseSortParams(sp, "unit", "asc");
  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      units: {
        include: {
          leases: {
            where: { status: "ACTIVE" },
            include: { payments: true, charges: true, tenant: true },
          },
        },
      },
      loans: {
        include: { payments: { orderBy: { paidAt: "desc" }, take: 5 } },
      },
      expenses: true,
      distributions: { orderBy: { paidAt: "desc" } },
      documents: { orderBy: { uploadedAt: "desc" } },
      recurring: { orderBy: [{ active: "desc" }, { category: "asc" }] },
      capex: { orderBy: { placedInService: "desc" } },
      members: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } },
      audits: {
        orderBy: { createdAt: "desc" },
        take: 15,
        include: { user: { select: { email: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!property) notFound();

  const now = new Date();
  const yearStart = startOfYear(now);
  const yearEnd = endOfYear(now);
  const t12Start = addMonths(now, -12);

  const allLeases = property.units.flatMap((u) => u.leases);
  // Forward T12 income from rent roll: lease rent + unit add-ons (RUBS,
  // parking, storage) annualized.
  const annualRentIncome = property.units.reduce((s, u) => {
    if (u.leases.length === 0) return s;
    const addOns = Number(u.rubs) + Number(u.parking) + Number(u.storage);
    const leaseRent = u.leases.reduce((ls, l) => ls + Number(l.monthlyRent), 0);
    return s + (leaseRent + addOns) * 12;
  }, 0);
  const ytdRentCollected = allLeases.flatMap((l) => l.payments).filter((p) => p.paidAt >= yearStart && p.paidAt <= yearEnd).reduce((s, p) => s + Number(p.amount), 0);
  // Trailing-12-month operating expenses (actual imports).
  const t12Expenses = property.expenses.filter((e) => e.incurredAt >= t12Start && e.incurredAt <= now).reduce((s, e) => s + Number(e.amount), 0);
  const totalLoanBalance = property.loans.reduce((s, l) => s + Number(l.currentBalance), 0);
  const annualDebtService = property.loans.reduce((s, l) => s + Number(l.monthlyPayment) * 12, 0);

  const noi = annualRentIncome - t12Expenses;
  const annualCashFlow = noi - annualDebtService;
  const totalCashInvested = Number(property.downPayment ?? 0) + Number(property.closingCosts ?? 0) + Number(property.rehabCosts ?? 0);
  const propertyComments = await fetchComments("property", property.id, user);
  const cocReturn = cashOnCash(annualCashFlow, totalCashInvested);
  const equity = property.currentValue ? estimatedEquity(Number(property.currentValue), totalLoanBalance) : null;

  let irrValue: number | null = null;
  if (property.purchaseDate && totalCashInvested > 0) {
    const years = differenceInCalendarYears(now, property.purchaseDate);
    if (years > 0) {
      const flows: number[] = [-totalCashInvested];
      for (let y = 0; y < years - 1; y++) flows.push(annualCashFlow);
      flows.push(annualCashFlow + (equity ?? 0));
      irrValue = irr(flows);
    }
  }

  return (
    <PageShell title={property.name} action={<Link href="/properties" className="text-sm hover:underline">← All properties</Link>}>
      <Card title="Property Details">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Item label="Address" value={[property.address, property.city, property.state, property.zip].filter(Boolean).join(", ") || "—"} />
          <Item label="Purchase price" value={property.purchasePrice ? money(property.purchasePrice) : "—"} />
          <Item label="Purchase date" value={property.purchaseDate ? displayDate(property.purchaseDate) : "—"} />
          <Item label="Current value" value={property.currentValue ? money(property.currentValue) : "—"} />
          <Item label="Down payment" value={property.downPayment ? money(property.downPayment) : "—"} />
          <Item label="Closing costs" value={property.closingCosts ? money(property.closingCosts) : "—"} />
          <Item label="Rehab costs" value={property.rehabCosts ? money(property.rehabCosts) : "—"} />
          <Item label="Total invested" value={money(totalCashInvested)} />
          <Item label="Your ownership" value={`${(Number(property.ownershipPercent) * 100).toFixed(2)}%`} />
        </dl>
        <div className="mt-3">
          <EditProperty property={{
            id: property.id, name: property.name,
            address: property.address, city: property.city, state: property.state, zip: property.zip,
            purchasePrice: property.purchasePrice?.toString() ?? null,
            purchaseDate: property.purchaseDate ? isoDate(property.purchaseDate) : null,
            currentValue: property.currentValue?.toString() ?? null,
            downPayment: property.downPayment?.toString() ?? null,
            closingCosts: property.closingCosts?.toString() ?? null,
            rehabCosts: property.rehabCosts?.toString() ?? null,
            ownershipPercent: property.ownershipPercent?.toString() ?? null,
            notes: property.notes,
          }} />
        </div>
      </Card>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {user.canSeeFinancials && (
          <>
            <StatCard label="Annual rent (forward T12)" value={money(annualRentIncome)} />
            <StatCard label="YTD collected" value={money(ytdRentCollected)} />
            <StatCard label="T12 expenses" value={money(t12Expenses)} />
            <StatCard label="NOI (T12)" value={money(noi)} />
            <StatCard label="Annual debt service" value={money(annualDebtService)} />
            <StatCard label="Annual cash flow" value={money(annualCashFlow)} color={annualCashFlow >= 0 ? "green" : "red"} />
            <StatCard label="Cash-on-cash return" value={formatPct(cocReturn)} color={cocReturn && cocReturn >= 0 ? "green" : "red"} />
            <StatCard label="Estimated equity" value={equity != null ? money(equity) : "—"} />
            <StatCard label="Loan balance" value={money(totalLoanBalance)} />
            <StatCard label="IRR" value={formatPct(irrValue)} />
          </>
        )}
        <StatCard label="Units" value={String(property.units.length)} />
        <StatCard label="Active leases" value={String(allLeases.length)} />
      </section>

      <Card title="Units">
        {property.units.length === 0 ? (
          <p className="text-sm text-zinc-500">No units assigned. Go to <Link href="/units" className="text-blue-600 hover:underline">Units</Link> and assign them to this property.</p>
        ) : ((unitsForSort: typeof property.units) => {
          type UnitRow = (typeof unitsForSort)[number];
          const unitAccessors: Record<string, (u: UnitRow) => unknown> = {
            unit: (u) => u.label,
            tenant: (u) => {
              const l = u.leases[0];
              return l ? `${l.tenant.lastName} ${l.tenant.firstName}`.toLowerCase() : "zzz";
            },
            rent: (u) => Number(u.rent),
            expires: (u) => u.leases[0]?.endDate ?? new Date(8.64e15),
          };
          const sortedUnits = sortRows(unitsForSort, unitAccessors[sortField] ?? unitAccessors.unit, sortDir);
          return (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <SortHeader field="unit" label="Unit" />
                <SortHeader field="tenant" label="Tenant" />
                <SortHeader field="rent" label="Rent" defaultDir="desc" />
                <SortHeader field="expires" label="Lease expires" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {sortedUnits.map((u) => {
                const activeLease = u.leases[0];
                return (
                  <tr key={u.id}>
                    <td className="py-2 font-medium">{u.label}</td>
                    <td>{activeLease ? `${activeLease.tenant.firstName} ${activeLease.tenant.lastName}` : <span className="text-red-500">Vacant</span>}</td>
                    <td>{money(u.rent)}</td>
                    <td>{activeLease ? displayDate(activeLease.endDate) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          );
        })(property.units)}
      </Card>

      {user.canSeeFinancials && (<Card title="Loans">
        <form action={addLoan} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end mb-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <input type="hidden" name="propertyId" value={property.id} />
          <Field label="Lender"><input name="lender" required className={inputCls} /></Field>
          <Field label="Original amount"><input name="originalAmount" type="number" step="0.01" required className={inputCls} /></Field>
          <Field label="Current balance"><input name="currentBalance" type="number" step="0.01" required className={inputCls} /></Field>
          <Field label="Interest rate %"><input name="interestRate" type="number" step="0.001" required className={inputCls} /></Field>
          <Field label="Term (months)"><input name="termMonths" type="number" required className={inputCls} /></Field>
          <Field label="Monthly payment"><input name="monthlyPayment" type="number" step="0.01" required className={inputCls} /></Field>
          <Field label="Start date"><input name="startDate" type="date" required className={inputCls} /></Field>
          <Field label="Maturity date"><input name="maturityDate" type="date" className={inputCls} /></Field>
          <Field label="Loan type">
            <select name="loanType" className={inputCls} defaultValue="Fixed">
              <option>Fixed</option><option>ARM</option><option>Interest Only</option><option>Other</option>
            </select>
          </Field>
          <button type="submit" className={btnCls}>Add loan</button>
        </form>

        {property.loans.length === 0 ? (
          <p className="text-sm text-zinc-500">No loans yet.</p>
        ) : (
          <div className="space-y-6">
            {property.loans.map((loan) => (
              <div key={loan.id} className="border border-zinc-200 dark:border-zinc-800 rounded p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-medium">{loan.lender}</h3>
                    <p className="text-xs text-zinc-500">{loan.loanType} — {Number(loan.interestRate)}% — {loan.termMonths} months</p>
                  </div>
                  <form action={deleteLoan}>
                    <input type="hidden" name="id" value={loan.id} />
                    <input type="hidden" name="propertyId" value={property.id} />
                    <button className={btnDanger}>Delete</button>
                  </form>
                </div>
                <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                  <Item label="Original" value={money(loan.originalAmount)} />
                  <Item label="Balance" value={money(loan.currentBalance)} />
                  <Item label="Monthly" value={money(loan.monthlyPayment)} />
                  <Item label="Maturity" value={loan.maturityDate ? displayDate(loan.maturityDate) : "—"} />
                </dl>

                <details className="text-sm">
                  <summary className="cursor-pointer text-blue-600 hover:underline mb-2">Record payment / View history</summary>
                  <form action={addLoanPayment} className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end mb-3">
                    <input type="hidden" name="loanId" value={loan.id} />
                    <input type="hidden" name="propertyId" value={property.id} />
                    <Field label="Date"><input name="paidAt" type="date" required defaultValue={isoDate(new Date())} className={inputCls} /></Field>
                    <Field label="Total"><input name="totalAmount" type="number" step="0.01" required defaultValue={loan.monthlyPayment.toString()} className={inputCls} /></Field>
                    <Field label="Principal"><input name="principal" type="number" step="0.01" required className={inputCls} /></Field>
                    <Field label="Interest"><input name="interest" type="number" step="0.01" required className={inputCls} /></Field>
                    <Field label="Escrow"><input name="escrow" type="number" step="0.01" className={inputCls} /></Field>
                    <button type="submit" className={btnCls}>Record</button>
                  </form>
                  {loan.payments.length > 0 && (
                    <table className="w-full text-xs min-w-[640px]">
                      <thead className="text-left text-zinc-500"><tr><th className="py-1">Date</th><th>Total</th><th>Principal</th><th>Interest</th><th>Escrow</th></tr></thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {loan.payments.map((p) => (
                          <tr key={p.id}><td className="py-1">{displayDate(p.paidAt)}</td><td>{money(p.totalAmount)}</td><td>{money(p.principal)}</td><td>{money(p.interest)}</td><td>{p.escrow ? money(p.escrow) : "—"}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </details>
              </div>
            ))}
          </div>
        )}
      </Card>)}

      {user.canSeeFinancials && (<Card title="Distributions / Cash-Out Events">
        <form action={addDistribution} className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end mb-4">
          <input type="hidden" name="propertyId" value={property.id} />
          <Field label="Date"><input name="paidAt" type="date" required defaultValue={isoDate(new Date())} className={inputCls} /></Field>
          <Field label="Amount"><input name="amount" type="number" step="0.01" required className={inputCls} /></Field>
          <Field label="Type">
            <select name="kind" className={inputCls} defaultValue="Distribution">
              <option>Distribution</option>
              <option>Refi Cash Out</option>
              <option>Sale Proceeds</option>
            </select>
          </Field>
          <div className="md:col-span-2 flex gap-2">
            <div className="flex-1">
              <Field label="Memo"><input name="memo" className={inputCls} placeholder="Optional context" /></Field>
            </div>
            <button type="submit" className={btnCls + " self-end"}>Add</button>
          </div>
        </form>

        {property.distributions.length === 0 ? (
          <p className="text-sm text-zinc-500">None recorded. Log refi cash-out proceeds, sale net proceeds, or any other special cash returns to owners here so they show up in the IRR calculation.</p>
        ) : ((distsForSort: typeof property.distributions) => {
          type DistRow = (typeof distsForSort)[number];
          const distAccessors: Record<string, (d: DistRow) => unknown> = {
            distDate: (d) => d.paidAt,
            distAmount: (d) => Number(d.amount),
            distKind: (d) => d.kind,
            distMemo: (d) => d.memo ?? "",
          };
          const sortedDist = sortRows(distsForSort, distAccessors[sortField] ?? distAccessors.distDate, sortDir);
          return (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <SortHeader field="distDate" label="Date" defaultDir="desc" />
                <SortHeader field="distAmount" label="Amount" defaultDir="desc" />
                <SortHeader field="distKind" label="Type" />
                <SortHeader field="distMemo" label="Memo" />
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {sortedDist.map((d) => (
                <tr key={d.id}>
                  <td className="py-2">{displayDate(d.paidAt)}</td>
                  <td className="font-medium tabular-nums">{money(d.amount)}</td>
                  <td>{d.kind}</td>
                  <td className="text-zinc-600 dark:text-zinc-400">{d.memo ?? "—"}</td>
                  <td className="text-right">
                    <form action={deleteDistribution}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="propertyId" value={property.id} />
                      <button className={btnDanger}>Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-2">Total</td>
                <td className="tabular-nums">{money(property.distributions.reduce((s, d) => s + Number(d.amount), 0))}</td>
                <td colSpan={3}></td>
              </tr>
            </tbody>
          </table>
          );
        })(property.distributions)}
      </Card>)}

      {user.canSeeFinancials && (<Card title={`Recurring Expenses${property.recurring.length > 0 ? ` (${property.recurring.filter((r) => r.active).length} active)` : ""}`}>
        <p className="text-xs text-zinc-500 mb-3">
          Templates that auto-generate an Expense row on the 1st of each month.
          Use these for fixed monthly costs (insurance, taxes, mgmt fees) so the T12 metric stays complete.
        </p>
        <form action={addRecurring} className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end mb-4 pb-4 border-b border-zinc-200/60 dark:border-zinc-800/60 text-sm">
          <input type="hidden" name="propertyId" value={property.id} />
          <Field label="Category"><input name="category" required className={inputCls} placeholder="Insurance" /></Field>
          <Field label="Amount"><input name="amount" type="number" step="0.01" required className={inputCls} /></Field>
          <Field label="Day of month"><input name="dayOfMonth" type="number" min={1} max={28} defaultValue={1} className={inputCls} /></Field>
          <Field label="Vendor"><input name="vendor" className={inputCls} placeholder="Optional" /></Field>
          <Field label="Start date"><input name="startDate" type="date" required defaultValue={isoDate(new Date())} className={inputCls} /></Field>
          <Field label="End date (optional)"><input name="endDate" type="date" className={inputCls} /></Field>
          <div className="md:col-span-5">
            <Field label="Memo"><input name="memo" className={inputCls} placeholder="Optional" /></Field>
          </div>
          <button type="submit" className={btnCls}>Add template</button>
        </form>

        {property.recurring.length === 0 ? (
          <p className="text-sm text-zinc-500">No recurring expense templates yet.</p>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2 text-left">Category</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Day</th>
                <th className="text-left">Vendor</th>
                <th className="text-right">Range</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {property.recurring.map((r) => (
                <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                  <td className="py-2 font-medium">{r.category}{r.memo ? <div className="text-[11px] text-zinc-500 font-normal truncate max-w-[30ch]">{r.memo}</div> : null}</td>
                  <td className="text-right tabular-nums">{money(r.amount)}</td>
                  <td className="text-right tabular-nums">{r.dayOfMonth}</td>
                  <td>{r.vendor ?? "—"}</td>
                  <td className="text-right tabular-nums whitespace-nowrap text-[11px] text-zinc-500">
                    {displayDate(r.startDate)}{r.endDate ? ` → ${displayDate(r.endDate)}` : ""}
                  </td>
                  <td>{r.active ? <span className="text-emerald-700 dark:text-emerald-400 font-medium">Active</span> : <span className="text-zinc-500">Paused</span>}</td>
                  <td className="text-right">
                    <div className="flex gap-2 justify-end">
                      <form action={toggleRecurring}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="propertyId" value={property.id} />
                        <input type="hidden" name="active" value={r.active ? "false" : "true"} />
                        <button className="text-xs text-zinc-600 dark:text-zinc-400 hover:underline">{r.active ? "Pause" : "Resume"}</button>
                      </form>
                      <form action={deleteRecurring}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="propertyId" value={property.id} />
                        <button className={btnDanger}>Delete</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>)}

      {user.canSeeFinancials && (() => {
        const capex = property.capex;
        const totalBasis = capex.reduce((s, c) => s + Number(c.amount), 0);
        // Straight-line annual depreciation across all items.
        const annualDep = capex.reduce((s, c) => {
          const yrs = Math.max(1, c.usefulLifeYears);
          return s + Number(c.amount) / yrs;
        }, 0);
        // Accumulated depreciation as of today, capped at item basis.
        const today = new Date();
        let accumulated = 0;
        for (const c of capex) {
          const yearsElapsed = (today.getTime() - c.placedInService.getTime()) / (365.25 * 86400000);
          const cappedYears = Math.max(0, Math.min(c.usefulLifeYears, yearsElapsed));
          accumulated += (Number(c.amount) / Math.max(1, c.usefulLifeYears)) * cappedYears;
        }
        const remainingBasis = Math.max(0, totalBasis - accumulated);
        return (
          <Card title="Capital Improvements">
            <p className="text-xs text-zinc-500 mb-3">
              Items kept separate from operating expenses — not subtracted from NOI.
              Tracked here for tax (depreciation), refinance, and sale-cost-basis
              purposes. Default useful life is 27 years (residential structure);
              edit per item: 5y for appliances/carpet, 15y for site improvements,
              etc.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
              <div className="rounded-lg bg-zinc-50/80 dark:bg-zinc-800/50 p-3">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Total basis</div>
                <div className="text-base font-bold mt-0.5 tabular-nums">{money(totalBasis)}</div>
              </div>
              <div className="rounded-lg bg-zinc-50/80 dark:bg-zinc-800/50 p-3">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Accumulated depreciation</div>
                <div className="text-base font-bold mt-0.5 tabular-nums">{money(accumulated)}</div>
              </div>
              <div className="rounded-lg bg-zinc-50/80 dark:bg-zinc-800/50 p-3">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Remaining basis</div>
                <div className="text-base font-bold mt-0.5 tabular-nums">{money(remainingBasis)}</div>
              </div>
              <div className="rounded-lg bg-zinc-50/80 dark:bg-zinc-800/50 p-3">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Annual depreciation</div>
                <div className="text-base font-bold mt-0.5 tabular-nums">{money(annualDep)}</div>
              </div>
            </div>

            <form action={addCapEx} className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end mb-4 pb-4 border-b border-zinc-200/60 dark:border-zinc-800/60 text-sm">
              <input type="hidden" name="propertyId" value={property.id} />
              <Field label="Category">
                <select name="category" required defaultValue="Renovation" className={inputCls}>
                  <option>Roof</option>
                  <option>HVAC</option>
                  <option>Appliances</option>
                  <option>Plumbing</option>
                  <option>Electrical</option>
                  <option>Flooring</option>
                  <option>Renovation</option>
                  <option>Site Improvement</option>
                  <option>Other</option>
                </select>
              </Field>
              <Field label="Amount"><input name="amount" type="number" step="0.01" required className={inputCls} /></Field>
              <Field label="Useful life (yr)"><input name="usefulLifeYears" type="number" min={1} max={99} defaultValue={27} className={inputCls} /></Field>
              <Field label="Placed in service"><input name="placedInService" type="date" required defaultValue={isoDate(new Date())} className={inputCls} /></Field>
              <Field label="Vendor"><input name="vendor" className={inputCls} placeholder="Optional" /></Field>
              <button type="submit" className={btnCls}>Add CapEx</button>
              <div className="md:col-span-3">
                <Field label="Description"><input name="description" required className={inputCls} placeholder="New roof, replaced 4 AC units, etc." /></Field>
              </div>
              <div className="md:col-span-3">
                <Field label="Notes"><input name="notes" className={inputCls} /></Field>
              </div>
            </form>

            {capex.length === 0 ? (
              <p className="text-sm text-zinc-500">No capital improvements logged.</p>
            ) : (
              <table className="w-full text-sm min-w-[760px]">
                <thead className="text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-2 text-left">Date</th>
                    <th className="text-left">Category</th>
                    <th className="text-left">Description</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Useful life</th>
                    <th className="text-right">Annual dep.</th>
                    <th className="text-right">Accum. dep.</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {capex.map((c) => {
                    const yrs = Math.max(1, c.usefulLifeYears);
                    const annual = Number(c.amount) / yrs;
                    const yearsElapsed = (today.getTime() - c.placedInService.getTime()) / (365.25 * 86400000);
                    const accum = annual * Math.max(0, Math.min(yrs, yearsElapsed));
                    return (
                      <tr key={c.id}>
                        <td className="py-2 tabular-nums whitespace-nowrap">{displayDate(c.placedInService)}</td>
                        <td>{c.category}</td>
                        <td>
                          <div>{c.description}</div>
                          {(c.vendor || c.notes) && (
                            <div className="text-[11px] text-zinc-500 truncate max-w-[40ch]">
                              {c.vendor}{c.vendor && c.notes ? " · " : ""}{c.notes}
                            </div>
                          )}
                        </td>
                        <td className="text-right tabular-nums">{money(c.amount)}</td>
                        <td className="text-right tabular-nums">{yrs}y</td>
                        <td className="text-right tabular-nums text-zinc-500">{money(annual)}</td>
                        <td className="text-right tabular-nums text-zinc-500">{money(accum)}</td>
                        <td className="text-right">
                          <form action={deleteCapEx}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="propertyId" value={property.id} />
                            <button className={btnDanger}>Delete</button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        );
      })()}

      {user.canSeeFinancials && (() => {
        const today = new Date();
        const monthOpts: Array<{ key: string; label: string }> = [];
        for (let i = 0; i < 12; i++) {
          const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          monthOpts.push({ key, label: `${d.toLocaleString("en-US", { month: "long" })} ${d.getFullYear()}` });
        }
        return (<>
          <Card title="Owner Statement">
            <p className="text-xs text-zinc-500 mb-3">
              Branded PDF of the property&apos;s monthly P&amp;L: rent collected by unit,
              expenses by category, NOI, debt service, net cash flow, plus a
              year-to-date summary. Choose whose view to render —
              every dollar is scaled by their ownership %.
            </p>
            {(() => {
              const adminShare = Number(property.ownershipPercent);
              const ownerOptions: { key: string; label: string }[] = [
                { key: "", label: "Whole property (100%)" },
              ];
              // Admin's own view, drawn from Property.ownershipPercent
              // (already populated for the dashboard / assets) — no
              // PropertyMember row required.
              if (user.isAdmin && adminShare > 0 && adminShare < 1) {
                const adminName = [user.firstName, user.lastName].filter(Boolean).join(" ") || (user.email || "You");
                ownerOptions.push({
                  key: `share:${adminShare}:${adminName}`,
                  label: `${adminName} — admin share (${(adminShare * 100).toFixed(2)}%)`,
                });
              } else if (user.isAdmin && adminShare === 1) {
                // 100% admin = same as whole property; no separate row.
              }
              for (const m of property.members) {
                if (Number(m.ownershipPercent) <= 0) continue;
                const name = [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email;
                const pct = (Number(m.ownershipPercent) * 100).toFixed(2);
                ownerOptions.push({ key: `member:${m.user.id}`, label: `${name} (${pct}%)` });
              }
              return <OwnerStatementButton propertyId={property.id} options={monthOpts} ownerOptions={ownerOptions} />;
            })()}
          </Card>

          <Card title="Property Package">
            <p className="text-xs text-zinc-500 mb-3">
              Multi-page lender / partner / buyer package: cover, full rent roll, T12 P&amp;L,
              loan terms, and capital improvements. Generates a fresh PDF on demand.
            </p>
            <a
              href={`/api/property-package/${property.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-blue-800"
            >
              Download package PDF
            </a>
          </Card>
        </>);
      })()}

      <Card title="Notes & Comments">
        <p className="text-xs text-zinc-500 mb-3">
          Internal notes for owners and partners on this property. Visible to admin and to
          partners with access to {property.name}. Not visible to tenants.
        </p>
        <CommentThread scope="property" scopeId={property.id} comments={propertyComments} />
      </Card>

      <Card title="Recent Activity">
        {property.audits.length === 0 ? (
          <p className="text-sm text-zinc-500">No activity yet on this property.</p>
        ) : (
          <ul className="text-sm divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {property.audits.map((a) => {
              const who = a.user
                ? [a.user.firstName, a.user.lastName].filter(Boolean).join(" ") || a.user.email
                : a.userEmail ?? "system";
              return (
                <li key={a.id} className="py-1.5 flex items-start gap-3">
                  <span className="text-[11px] tabular-nums text-zinc-500 whitespace-nowrap min-w-[60px]">
                    {displayDate(a.createdAt)}
                  </span>
                  <span className="flex-1">
                    <span className="font-medium">{who}</span> · {a.summary}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-400 whitespace-nowrap">{a.action}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <DocumentsCard
        scope="propertyId"
        scopeId={property.id}
        documents={property.documents.map((d) => ({
          id: d.id,
          name: d.name,
          category: d.category,
          contentType: d.contentType,
          sizeBytes: d.sizeBytes,
          uploadedAt: d.uploadedAt.toISOString(),
          notes: d.notes,
        }))}
      />
    </PageShell>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt><dd className="mt-1">{value}</dd></div>;
}

function StatCard({ label, value, color }: { label: string; value: string; color?: "green" | "red" }) {
  const colorCls = color === "green" ? "text-green-600" : color === "red" ? "text-red-600" : "";
  return (
    <div className="rounded-xl border border-white/40 dark:border-zinc-700/50 bg-white/65 dark:bg-zinc-900/65 backdrop-blur-2xl p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${colorCls}`}>{value}</div>
    </div>
  );
}
