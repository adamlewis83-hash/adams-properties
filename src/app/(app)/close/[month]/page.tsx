import { notFound } from "next/navigation";
import { endOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireFinancials, accessiblePropertyIds } from "@/lib/auth";
import { CloseBoard, type BoardProperty, type BoardLine } from "./close-board";

export const dynamic = "force-dynamic";

// Default variable (enter-this-month) lines when a property has no
// saved close yet. Matches the design prototype.
const DEFAULT_VARIABLE = ["Repairs", "Utilities (common)", "Other"];

export default async function MonthlyClosePage({ params }: { params: Promise<{ month: string }> }) {
  const { month: monthParam } = await params;
  const m = monthParam.match(/^(\d{4})-(\d{2})$/);
  if (!m) notFound();
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) notFound();

  const me = await requireFinancials();
  const accessible = await accessiblePropertyIds(me);

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);

  const properties = await prisma.property.findMany({
    where: { id: { in: accessible }, isPersonalResidence: false },
    orderBy: { name: "asc" },
    include: {
      units: {
        include: { leases: { where: { status: "ACTIVE" }, select: { monthlyRent: true } } },
      },
      loans: { select: { monthlyPayment: true } },
      recurring: {
        where: {
          active: true,
          startDate: { lte: monthEnd },
          OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
        },
        orderBy: { category: "asc" },
        select: { category: true, vendor: true, amount: true },
      },
      monthlyCloses: {
        where: { year, month },
        include: { lines: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  const boardProps: BoardProperty[] = properties.map((p) => {
    const close = p.monthlyCloses[0] ?? null;

    let recurring: BoardLine[];
    let variable: BoardLine[];

    if (close) {
      // Saved snapshot — use it verbatim so locked months stay frozen.
      recurring = close.lines
        .filter((l) => l.kind === "RECURRING")
        .map((l, i) => ({ label: l.label, amount: Number(l.amount), source: l.source, sortOrder: i }));
      // Variable lines are stored signed (negative = expense) but the
      // board's inputs show the entered (positive) value.
      variable = close.lines
        .filter((l) => l.kind === "VARIABLE")
        .map((l, i) => ({ label: l.label, amount: Math.abs(Number(l.amount)), source: l.source, sortOrder: i }));
      if (close.status !== "LOCKED") {
        // Open month: variable lines that were saved empty aren't
        // persisted — re-surface the default labels so the inputs
        // come back after a reload.
        for (const label of DEFAULT_VARIABLE) {
          if (!variable.some((v) => v.label === label)) {
            variable.push({ label, amount: null, source: "manual", sortOrder: variable.length });
          }
        }
      }
    } else {
      // No close yet — auto-populate recurring from live records.
      const activeLeases = p.units.flatMap((u) => u.leases);
      const rentTotal = activeLeases.reduce((s, l) => s + Number(l.monthlyRent), 0);
      const unitCount = activeLeases.length;
      const mortgageTotal = p.loans.reduce((s, l) => s + Number(l.monthlyPayment), 0);

      recurring = [];
      if (rentTotal > 0) {
        recurring.push({
          label: `Rent income (${unitCount} unit${unitCount === 1 ? "" : "s"})`,
          amount: rentTotal,
          source: "lease",
          sortOrder: 0,
        });
      }
      if (mortgageTotal > 0) {
        recurring.push({ label: "Mortgage payment", amount: -mortgageTotal, source: "loan", sortOrder: 1 });
      }
      for (const r of p.recurring) {
        recurring.push({
          label: r.vendor ? `${r.category} — ${r.vendor}` : r.category,
          amount: -Number(r.amount),
          source: "recurring",
          sortOrder: recurring.length,
        });
      }

      variable = DEFAULT_VARIABLE.map((label, i) => ({ label, amount: null, source: "manual", sortOrder: i }));
    }

    const unitCount = p.units.length;
    return {
      id: p.id,
      name: p.name,
      sub: `${unitCount} unit${unitCount === 1 ? "" : "s"}${p.city ? ` · ${p.city}` : ""}`,
      locked: close?.status === "LOCKED",
      recurring,
      variable,
    };
  });

  return (
    <CloseBoard
      year={year}
      month={month}
      properties={boardProps}
      isAdmin={me.isAdmin}
    />
  );
}
