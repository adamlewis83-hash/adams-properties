"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";

const ALL_LINKS: Array<{ href: string; label: string; adminOnly?: boolean; financialsOnly?: boolean }> = [
  { href: "/", label: "Dashboard" },
  { href: "/properties", label: "Properties" },
  { href: "/leases", label: "Leases" },
  { href: "/payments", label: "Rent", financialsOnly: true },
  { href: "/maintenance", label: "Maintenance" },
  { href: "/vendors", label: "Vendors" },
  { href: "/expenses", label: "Expenses", financialsOnly: true },
  { href: "/analytics", label: "Analytics", financialsOnly: true },
  { href: "/assets", label: "Assets", adminOnly: true },
  { href: "/admin/bank-feeds", label: "Bank feeds", adminOnly: true },
  { href: "/admin/document-library", label: "Forms", adminOnly: true },
  { href: "/chat", label: "Chat" },
  { href: "/admin/taxes", label: "Taxes", adminOnly: true },
  { href: "/admin/members", label: "Members", adminOnly: true },
  { href: "/admin/audit", label: "Audit", adminOnly: true },
];

export function Nav({ isAdmin = true, canSeeFinancials = true }: { isAdmin?: boolean; canSeeFinancials?: boolean }) {
  const links = ALL_LINKS.filter((l) => {
    if (l.adminOnly && !isAdmin) return false;
    if (l.financialsOnly && !canSeeFinancials) return false;
    return true;
  });
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const linkClass = (href: string) =>
    `block px-3 py-1.5 rounded-sm text-[13px] tracking-wide transition-colors ${
      isActive(href)
        ? "text-[var(--brand-gold-soft)] font-medium border-b-2 border-[var(--brand-gold)]"
        : "text-white/75 hover:text-white border-b-2 border-transparent hover:border-white/30"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--brand-navy-2)] bg-[var(--brand-navy)] shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 shrink-0 group"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-sm bg-[var(--brand-gold)] text-[var(--brand-navy)] text-[10px] font-bold tracking-widest shadow-sm group-hover:bg-[var(--brand-gold-soft)] transition-colors">JAM</span>
          <span className="hidden sm:inline font-serif text-[15px] text-white tracking-tight">JAM Property Management</span>
          <span className="sm:hidden font-serif text-white text-base tracking-tight">JAM</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex gap-0.5 text-sm flex-wrap">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass(l.href)}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <form action={logout} className="hidden sm:block">
            <button className="text-[12px] uppercase tracking-[0.15em] text-white/70 hover:text-[var(--brand-gold-soft)] transition-colors">Sign out</button>
          </form>

          {/* Mobile / tablet hamburger */}
          <button
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="lg:hidden inline-flex items-center justify-center rounded-sm border border-white/20 bg-[var(--brand-navy-2)] w-9 h-9 text-white hover:bg-[var(--brand-navy)] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {open ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      {open && (
        <div className="lg:hidden border-t border-[var(--brand-navy-2)] bg-[var(--brand-navy)]">
          <nav className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col gap-1 text-sm">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={linkClass(l.href)}
              >
                {l.label}
              </Link>
            ))}
            <form action={logout} className="sm:hidden pt-2 mt-2 border-t border-[var(--brand-navy-2)]">
              <button className="block w-full text-left px-3 py-1.5 text-[12px] uppercase tracking-[0.15em] text-white/70 hover:text-[var(--brand-gold-soft)] transition-colors">Sign out</button>
            </form>
          </nav>
        </div>
      )}
    </header>
  );
}
