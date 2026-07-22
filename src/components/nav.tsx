"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { PrivacyToggle } from "@/components/privacy-toggle";

/**
 * Collapsed navigation per the design review (P0.4): 15 tabs → 6.
 *   Dashboard · Properties · Leasing · Money · Maintenance · Analytics
 * Members / Audit / Chat / Assets live under a ··· utility menu.
 * Active item = gold-light text on a translucent gold pill (prototype).
 */

type NavChild = {
  href: string;
  label: string;
  adminOnly?: boolean;
  financialsOnly?: boolean;
  badge?: string;
};

type NavItem = {
  label: string;
  href?: string; // direct link when no children
  children?: NavChild[];
  adminOnly?: boolean;
  financialsOnly?: boolean;
};

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Properties", href: "/properties" },
  {
    label: "Leasing",
    children: [
      { href: "/leases", label: "Leases" },
      { href: "/admin/document-library", label: "Forms", adminOnly: true },
    ],
  },
  {
    label: "Money",
    financialsOnly: true,
    children: [
      { href: "/payments", label: "Rent" },
      { href: "/expenses", label: "Expenses" },
      { href: "/close", label: "Monthly Close" },
      { href: "/admin/bank-feeds", label: "Bank feeds", adminOnly: true },
      { href: "/admin/import-csv", label: "Bulk import", adminOnly: true },
    ],
  },
  {
    label: "Maintenance",
    children: [
      { href: "/maintenance", label: "Tickets" },
      { href: "/vendors", label: "Vendors" },
    ],
  },
  { label: "Analytics", href: "/analytics", financialsOnly: true },
];

const UTILITY: NavChild[] = [
  { href: "/chat", label: "Chat" },
  { href: "/assets", label: "Assets", adminOnly: true, badge: "Private — only you" },
  { href: "/admin/members", label: "Members", adminOnly: true },
  { href: "/admin/audit", label: "Audit", adminOnly: true },
];

export function Nav({ isAdmin = true, canSeeFinancials = true }: { isAdmin?: boolean; canSeeFinancials?: boolean }) {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenu]);

  // Close menus on navigation.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  const allowChild = (c: NavChild) =>
    (!c.adminOnly || isAdmin) && (!c.financialsOnly || canSeeFinancials);

  const items = NAV.filter(
    (i) => (!i.adminOnly || isAdmin) && (!i.financialsOnly || canSeeFinancials),
  )
    .map((i) => (i.children ? { ...i, children: i.children.filter(allowChild) } : i))
    .filter((i) => !i.children || i.children.length > 0);

  const utility = UTILITY.filter(allowChild);

  const isActiveHref = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  const isActiveItem = (i: NavItem) =>
    i.href ? isActiveHref(i.href) : (i.children ?? []).some((c) => isActiveHref(c.href));
  const utilityActive = utility.some((c) => isActiveHref(c.href));

  const pillCls = (active: boolean) =>
    `px-3 py-2 rounded-lg text-[13.5px] whitespace-nowrap transition-colors ${
      active
        ? "font-semibold text-[#f0c75e] bg-[rgba(240,199,94,0.12)]"
        : "text-[#b9c2d4] hover:text-white"
    }`;

  return (
    <header ref={barRef} className="sticky top-0 z-40 border-b border-[var(--brand-navy-2)] bg-[var(--brand-navy)] shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[58px] flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[7px] bg-[var(--brand-gold)] text-[var(--brand-navy)] text-[11px] font-bold tracking-wide group-hover:bg-[var(--brand-gold-soft)] transition-colors">JAM</span>
            <span className="hidden xl:inline font-serif text-[17px] text-white tracking-tight whitespace-nowrap">JAM Property Management</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-0.5">
            {items.map((item) =>
              item.href ? (
                <Link key={item.label} href={item.href} className={pillCls(isActiveItem(item))}>
                  {item.label}
                </Link>
              ) : (
                <div key={item.label} className="relative">
                  <button
                    onClick={() => setOpenMenu((v) => (v === item.label ? null : item.label))}
                    className={pillCls(isActiveItem(item))}
                    aria-expanded={openMenu === item.label}
                  >
                    {item.label} <span className="text-[10px] opacity-70">▾</span>
                  </button>
                  {openMenu === item.label && (
                    <div className="absolute left-0 top-full mt-1 min-w-[190px] rounded-lg border border-[var(--rule)] bg-[var(--paper)] shadow-xl p-1 z-50">
                      {(item.children ?? []).map((c) => (
                        <Link
                          key={c.href}
                          href={c.href}
                          className={`block px-3 py-2 rounded-md text-[13px] transition-colors ${
                            isActiveHref(c.href)
                              ? "font-semibold text-[var(--brand-navy)] dark:text-[var(--brand-gold-soft)] bg-zinc-100 dark:bg-zinc-800"
                              : "text-[var(--foreground)] hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                          }`}
                        >
                          {c.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}

            {/* utility ··· */}
            {utility.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setOpenMenu((v) => (v === "···" ? null : "···"))}
                  className={pillCls(utilityActive)}
                  aria-label="More"
                  aria-expanded={openMenu === "···"}
                >
                  ···
                </button>
                {openMenu === "···" && (
                  <div className="absolute right-0 top-full mt-1 min-w-[210px] rounded-lg border border-[var(--rule)] bg-[var(--paper)] shadow-xl p-1 z-50">
                    {utility.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md text-[13px] transition-colors ${
                          isActiveHref(c.href)
                            ? "font-semibold text-[var(--brand-navy)] dark:text-[var(--brand-gold-soft)] bg-zinc-100 dark:bg-zinc-800"
                            : "text-[var(--foreground)] hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                        }`}
                      >
                        {c.label}
                        {c.badge && (
                          <span className="text-[9px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full" style={{ color: "var(--muted-fg)", background: "rgba(107,102,96,0.12)" }}>
                            {c.badge}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <PrivacyToggle />
          <ThemeToggle />
          <form action={logout} className="hidden sm:block">
            <button className="text-[12px] uppercase tracking-[0.15em] text-white/70 hover:text-[var(--brand-gold-soft)] transition-colors">Sign out</button>
          </form>

          {/* Mobile / tablet hamburger */}
          <button
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="lg:hidden inline-flex items-center justify-center rounded-md border border-white/20 bg-[var(--brand-navy-2)] w-9 h-9 text-white hover:bg-[var(--brand-navy)] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {mobileOpen ? (
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

      {/* Mobile panel: flat list with group headers */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-[var(--brand-navy-2)] bg-[var(--brand-navy)] max-h-[70vh] overflow-y-auto">
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col gap-0.5 text-sm">
            {items.map((item) =>
              item.href ? (
                <Link key={item.label} href={item.href} className={pillCls(isActiveItem(item)) + " block"}>
                  {item.label}
                </Link>
              ) : (
                <div key={item.label} className="flex flex-col gap-0.5">
                  <span className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.15em] text-white/40 font-semibold">
                    {item.label}
                  </span>
                  {(item.children ?? []).map((c) => (
                    <Link key={c.href} href={c.href} className={pillCls(isActiveHref(c.href)) + " block pl-5"}>
                      {c.label}
                    </Link>
                  ))}
                </div>
              ),
            )}
            {utility.length > 0 && (
              <div className="flex flex-col gap-0.5 border-t border-[var(--brand-navy-2)] mt-2 pt-2">
                <span className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-[0.15em] text-white/40 font-semibold">More</span>
                {utility.map((c) => (
                  <Link key={c.href} href={c.href} className={pillCls(isActiveHref(c.href)) + " flex items-center justify-between pl-5"}>
                    {c.label}
                    {c.badge && <span className="text-[9px] uppercase tracking-wide text-white/50">{c.badge}</span>}
                  </Link>
                ))}
              </div>
            )}
            <form action={logout} className="sm:hidden pt-2 mt-2 border-t border-[var(--brand-navy-2)]">
              <button className="block w-full text-left px-3 py-1.5 text-[12px] uppercase tracking-[0.15em] text-white/70 hover:text-[var(--brand-gold-soft)] transition-colors">Sign out</button>
            </form>
          </nav>
        </div>
      )}
    </header>
  );
}
