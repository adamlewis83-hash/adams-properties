"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Send a magic-link to the supplied email. The user clicks the link in
 * their inbox, lands at /auth/callback, and is signed in.
 */
export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect(`/login?error=${encodeURIComponent("Enter your email address")}`);

  // Build an absolute URL for the email link target. Prefer the
  // configured public URL; fall back to the request origin so this
  // works for arbitrary preview deploys too.
  const hdrs = await headers();
  const protoHeader = hdrs.get("x-forwarded-proto") ?? "https";
  const hostHeader = hdrs.get("host") ?? "www.jam-pm.com";
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${protoHeader}://${hostHeader}`;
  const emailRedirectTo = `${baseUrl.replace(/\/$/, "")}/auth/callback`;

  const supabase = await createSupabaseServerClient();
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
