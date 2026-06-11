import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { assertProdEnv } from "./lib/prodGuards";

// Fail loudly on the first request if prod is misconfigured, instead of
// silently storing credentials unencrypted / persisting nothing.
assertProdEnv();

// Routes accessible without authentication
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/privacy(.*)", // public — also the Chrome Web Store listing's privacy-policy URL
  "/terms(.*)",
  "/support(.*)",
  "/demo(.*)", // public read-only product sample — fictional data only
  "/share(.*)", // public share cards — render only what is in the URL
  "/api/og(.*)", // OG image renderer for share cards — no user data
  "/api/espn/relay(.*)", // extension posts here without Clerk session
  "/api/health(.*)",
  "/api/cron(.*)", // Vercel Cron has no Clerk session; routes verify CRON_SECRET
  "/api/webhooks(.*)", // Clerk webhooks carry no session; the route verifies svix signatures
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
