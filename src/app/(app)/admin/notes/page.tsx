import { redirect } from "next/navigation";

/**
 * The standalone Notes page has been folded into /chat — its
 * "Recent activity" feed now lives on the chat page below the
 * channel tabs. Redirect any old bookmarks/links there.
 */
export default function NotesPage() {
  redirect("/chat");
}
