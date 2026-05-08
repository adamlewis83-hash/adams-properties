import { Nav } from "@/components/nav";
import { requireAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAppUser();
  const year = new Date().getFullYear();
  return (
    <div className="min-h-screen flex flex-col">
      <Nav isAdmin={user.isAdmin} canSeeFinancials={user.canSeeFinancials} />
      <main className="flex-1">{children}</main>
      <footer className="mt-12 border-t border-[var(--rule)] bg-[var(--paper)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 grid gap-6 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-[var(--brand-navy)] text-[var(--brand-gold-soft)] text-[9px] font-bold tracking-widest">JAM</span>
              <span className="font-serif text-sm text-[var(--brand-navy)] dark:text-white">JAM Property Management</span>
            </div>
            <p className="text-xs text-[var(--muted-fg)] leading-relaxed">
              A privately-held real estate investment partnership.
              Active across Oregon and the western United States.
            </p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--brand-gold)] font-semibold mb-2">Investor Resources</div>
            <ul className="text-xs text-[var(--muted-fg)] space-y-1">
              <li>Quarterly statements available upon request</li>
              <li>Tax documents (K-1) issued annually</li>
              <li>Direct contact: ask the General Partner</li>
            </ul>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--brand-gold)] font-semibold mb-2">Disclosures</div>
            <p className="text-[11px] text-[var(--muted-fg)] leading-relaxed">
              All information presented is for the use of authorized partners only. Property values, occupancy, and financial figures are management estimates and may differ from audited results. Past performance is not indicative of future returns. Real estate investments are illiquid and involve risk of loss.
            </p>
          </div>
        </div>
        <div className="border-t border-[var(--rule)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[var(--muted-fg)]">
            <span>© {year} JAM Property Management · All rights reserved</span>
            <span>Confidential — Authorized Partners Only</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
