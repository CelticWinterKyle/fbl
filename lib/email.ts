// Minimal Resend sender — their REST API via fetch, no SDK dependency.
// Returns false (and logs) instead of throwing so callers can surface a
// friendly error to the user.

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set; skipping send");
    return false;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "League Blitz <noreply@leagueblitz.app>",
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("[email] Resend send failed:", r.status, detail.slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] Resend send error:", e);
    return false;
  }
}
