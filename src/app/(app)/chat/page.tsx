import { PageShell, Card } from "@/components/ui";
import { requireAppUser } from "@/lib/auth";
import { fetchComments } from "@/lib/comments";
import { ChatRoom } from "./chat-room";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const me = await requireAppUser();
  const initialMessages = await fetchComments("portfolio", null, me);

  return (
    <PageShell title="Partner chat">
      <Card title="Group chat">
        <p className="text-xs text-zinc-500 mb-3">
          Live partner conversation. Auto-refreshes every 5 seconds. Visible to admin and
          partners — managers and tenants don&apos;t see this. Same data as the portfolio
          thread on the Notes page, just rendered as a chat.
        </p>
        <ChatRoom initialMessages={initialMessages} />
      </Card>
    </PageShell>
  );
}
