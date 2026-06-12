// Phone-to-desktop handoff for the ESPN one-time setup.
// POST { action: "email" }   — email the user their own setup link (Resend)
// POST { action: "defer" }   — mark setup pending; dashboard shows a reminder
// POST { action: "dismiss" } — clear the pending reminder

import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { setEspnSetupPending } from "@/lib/tokenStore/index";
import { checkUserRateLimit } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const BASE = process.env.PUBLIC_BASE_URL ?? "https://leagueblitz.app";

function setupEmailHtml(connectUrl: string): string {
  const step = (n: number, text: string) => `
    <tr>
      <td style="padding:6px 12px 6px 0;vertical-align:top;">
        <span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:50%;background:#fbbf24;color:#0f1117;font-weight:bold;font-size:13px;text-align:center;">${n}</span>
      </td>
      <td style="padding:6px 0;color:#374151;font-size:15px;line-height:1.5;">${text}</td>
    </tr>`;
  return `
<div style="background:#f4f4f5;padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e4e4e7;">
    <p style="margin:0 0 4px;font-size:12px;font-weight:bold;letter-spacing:0.2em;color:#b45309;text-transform:uppercase;">League Blitz</p>
    <h1 style="margin:0 0 12px;font-size:22px;color:#111827;">Finish your ESPN league sync</h1>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
      You're reading this on a computer, which means you're in the right place.
      This takes about a minute, and you only ever do it once. After that your
      ESPN leagues stay synced everywhere, including your phone.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      ${step(1, "Click the button below and sign in to League Blitz.")}
      ${step(2, "Install the free League Blitz extension for Chrome (or use one-click sync for other browsers).")}
      ${step(3, "Open ESPN Fantasy and click into each league you play in. They'll appear in League Blitz automatically.")}
    </table>
    <a href="${connectUrl}" style="display:inline-block;background:#fbbf24;color:#0f1117;font-weight:bold;font-size:14px;letter-spacing:0.05em;padding:12px 28px;border-radius:8px;text-decoration:none;">FINISH SETUP</a>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:13px;line-height:1.5;">
      You asked us to send this from your phone. If that wasn't you, you can ignore this email.
    </p>
  </div>
</div>`;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action === "defer") {
    await setEspnSetupPending(userId, true);
    return NextResponse.json({ ok: true });
  }

  if (action === "dismiss") {
    await setEspnSetupPending(userId, false);
    return NextResponse.json({ ok: true });
  }

  if (action === "email") {
    const allowed = await checkUserRateLimit(userId, "espn-handoff-email", 3, 3600);
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Email already sent. Check your inbox, or try again in an hour." },
        { status: 429 }
      );
    }
    const user = await currentUser();
    const to =
      user?.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress;
    if (!to) {
      return NextResponse.json(
        { ok: false, error: "No email address on your account." },
        { status: 400 }
      );
    }
    const connectUrl = `${BASE}/connect`;
    const sent = await sendEmail({
      to,
      subject: "Finish your ESPN league sync",
      html: setupEmailHtml(connectUrl),
      text: `Finish your ESPN league sync\n\nThis takes about a minute on a computer, and you only do it once.\n\n1. Open ${connectUrl} and sign in.\n2. Install the free League Blitz extension for Chrome (or use one-click sync for other browsers).\n3. Open ESPN Fantasy and click into each league you play in. They'll appear in League Blitz automatically.\n\nYou asked us to send this from your phone. If that wasn't you, you can ignore this email.`,
    });
    if (!sent) {
      return NextResponse.json(
        { ok: false, error: "Couldn't send the email right now. Try again in a minute." },
        { status: 502 }
      );
    }
    // Emailing the link implies finishing later — arm the dashboard reminder too.
    await setEspnSetupPending(userId, true);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
