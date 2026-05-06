import { prisma } from "@/lib/prisma";
import type { CommentRow } from "@/components/comment-thread";
import type { AppUserContext } from "@/lib/auth";

/**
 * Fetch comments for a given scope. Returns [] if the table doesn't exist
 * yet (so pages render before db push). Marks each row's isMine for the
 * current user.
 */
export async function fetchComments(
  scope: "property" | "lease" | "portfolio",
  scopeId: string | null,
  me: AppUserContext,
): Promise<CommentRow[]> {
  try {
    const rows = await prisma.comment.findMany({
      where: { scope, scopeId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((c) => ({
      id: c.id,
      body: c.body,
      authorId: c.authorId,
      authorEmail: c.authorEmail,
      authorName: c.authorName,
      createdAt: c.createdAt.toISOString(),
      isMine: !!c.authorId && c.authorId === me.id,
    }));
  } catch {
    return [];
  }
}
