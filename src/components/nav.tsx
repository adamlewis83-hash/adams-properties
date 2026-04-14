import Link from "next/link";
import { logout } from "@/app/login/actions";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/units", label: "Units" },
  { href: "/tenants", label: "Tenants" },
  { href: "/leases", label: "Leases" },
  { href: "/payments", label: "Payments" },
  { href: "/maintenance", label: "Maintenance" },
  { href: "/vendors", label: "Vendors" },
  { href: "/expenses", label: "Expenses" },
];

export function Nav() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-6 flex-wrap">
        <Link href="/" className="font-semibold tracking-tight">Adam&apos;s Properties</Link>
        <nav className="flex gap-4 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:underline">{l.label}</Link>
          ))}
        </nav>
        <form action={logout}>
          <button className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">Sign out</button>
        </form>
      </div>
    </header>
  );
}
