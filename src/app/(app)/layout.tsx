import { Nav } from "@/components/nav";
import { requireAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAppUser();
  return (
    <div className="min-h-screen">
      <Nav isAdmin={user.isAdmin} />
      <main>{children}</main>
    </div>
  );
}
