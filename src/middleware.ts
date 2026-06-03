import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

// Protect the admin PAGE only (so it redirects to /login nicely).
// The API routes (/api/products, /api/sheets) self-guard with getServerSession
// and return JSON/401 — keeping them out of the matcher avoids a redirect to
// login HTML. The public shop ("/") is open.
export const config = {
  matcher: ["/catalog/:path*"],
};
