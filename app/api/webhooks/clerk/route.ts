import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { wipeUserData } from "@/lib/tokenStore/index";

// Clerk webhook receiver. Currently handles user.deleted: when a user deletes
// their account (or is deleted from the Clerk dashboard), wipe every KV key we
// hold for them — tokens, connections, relay blobs, my-team picks, theme, etc.
//
// Signature verification uses svix headers + the CLERK_WEBHOOK_SIGNING_SECRET
// env var (set it from the Clerk dashboard's webhook endpoint config). The
// route is public in middleware.ts; verification happens here.

export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch (e) {
    console.warn("[ClerkWebhook] signature verification failed", e);
    return new Response("Invalid webhook signature", { status: 400 });
  }

  if (evt.type === "user.deleted") {
    const userId = evt.data.id;
    if (userId) {
      try {
        const removed = await wipeUserData(userId);
        console.log(
          `[ClerkWebhook] user.deleted: wiped ${removed} stored keys for ${userId.slice(0, 8)}...`
        );
      } catch (e) {
        console.error(`[ClerkWebhook] wipeUserData failed for ${userId.slice(0, 8)}...`, e);
        // Return 500 so Clerk retries the delivery.
        return new Response("Cleanup failed", { status: 500 });
      }
    }
  }

  return new Response("OK", { status: 200 });
}
