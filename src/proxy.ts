import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Next's API proxy replaces the host header. Remember the public origin so
// agent card URLs stay on the address the caller actually used.
export function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  const origin = forwardedHost
    ? `${request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https"}://${forwardedHost}`
    : request.nextUrl.origin
  const headers = new Headers(request.headers)
  headers.set("x-a2human-origin", origin)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ["/api/:path*", "/.well-known/:path*"],
}
