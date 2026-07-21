import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// /close → current month's board.
export default function CloseIndexPage() {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  redirect(`/close/${ym}`);
}
