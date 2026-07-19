import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/groups",
  "/join",
  "/split",
  "/onboarding",
];

export async function middleware(request: NextRequest) {
  const authRes = await auth0.middleware(request);
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/auth")) return authRes;

  // Signed-out visits to app pages bounce through login and come back to the
  // exact URL — critical for the merchant handoff, whose query string carries
  // the signed order params.
  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const session = await auth0.getSession(request);
    if (!session) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("returnTo", pathname + search);
      return NextResponse.redirect(loginUrl);
    }
  }
  return authRes;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
