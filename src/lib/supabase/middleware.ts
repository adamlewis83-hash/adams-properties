import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/auth");
  // The filled-lease PDF is public ONLY when the request includes a
  // signToken (the route handler enforces that itself); we let it
  // through middleware so tenants can preview while signing.
  const filledLeaseWithToken =
    pathname.match(/^\/api\/lease\/[^/]+\/filled-lease$/) &&
    request.nextUrl.searchParams.has("token");

  const isPublic = pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/checkout") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/pay") ||
    pathname.startsWith("/tenant") ||
    pathname.startsWith("/sign") ||
    pathname.startsWith("/forms") ||
    !!filledLeaseWithToken ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/icon" ||
    pathname === "/icon0" ||
    pathname === "/icon1" ||
    pathname === "/apple-icon";

  if (isPublic) return response;

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}
