"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Single login entry point. If the user filled in a password, we sign
 * them in with email+password (instant). Otherwise we fall back to a
 * magic-link sent to their inbox.
 */
export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email) redirect(`/login?error=${encodeURIComponent("Enter your email address")}`);

  const supabase = await createSupabaseServerClient();

  // ── Password path ─────────────────────────────────────────────
  if (password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
    redirect("/");
  }

  // ── Magic-link path ───────────────────────────────────────────
  const hdrs = await headers();
  const protoHeader = hdrs.get("x-forwarded-proto") ?? "https";
  const hostHeader = hdrs.get("host") ?? "www.jam-pm.com";
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${protoHeader}://${hostHeader}`;
  const emailRedirectTo = `${baseUrl.replace(/\/$/, "")}/auth/callback`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: false, // Partners must be invited first; don't auto-provision strangers.
    },
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect(`/login?sent=${encodeURIComponent(email)}`);
}

export async function logout() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
