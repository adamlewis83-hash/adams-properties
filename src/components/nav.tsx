"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/login/actions";

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
    `block px-3 py-1.5 rounded-md transition-colors ${
      isActive(href)
        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium shadow-sm"
        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/70 dark:border-zinc-800/70 bg-white/75 dark:bg-zinc-950/75 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 font-semibold tracking-tight shrink-0"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-sm font-bold shadow-sm">A</span>
          <span className="hidden sm:inline">Adam&apos;s Properties</span>
          <span className="sm:hidden">Adam&apos;s</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex gap-0.5 text-sm flex-wrap">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass(l.href)}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <form action={logout} className="hidden sm:block">
            <button className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Sign out</button>
          </form>

          {/* Mobile / tablet hamburger */}
          <button
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="lg:hidden inline-flex items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 w-9 h-9 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shadow-sm"
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
        <div className="lg:hidden border-t border-zinc-200/70 dark:border-zinc-800/70 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md">
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
            <form action={logout} className="sm:hidden pt-2 mt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button className="block w-full text-left px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Sign out</button>
            </form>
          </nav>
        </div>
      )}
    </header>
  );
}
