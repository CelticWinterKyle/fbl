"use client";
// Notifications settings card on /connect. Subscribes this device to web
// push (service worker + PushManager) and manages per-type preferences.
// BRIGHT LINE: notification types are game events only, never odds/promos.

import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, Smartphone } from "lucide-react";

type Prefs = { td: boolean; closeGame: boolean; final: boolean };

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Browser";
}

const PREF_ROWS: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: "td", label: "Touchdowns", hint: "One of your players scores" },
  { key: "closeGame", label: "Close games", hint: "Your matchup is tight late" },
  { key: "final", label: "Finals", hint: "Final score for each league" },
];

export default function NotificationsCard() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [needsInstall, setNeedsInstall] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    // iOS only allows push for installed (home-screen) PWAs.
    const isIos = /iPhone|iPad/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setNeedsInstall(isIos && !standalone && !ok);

    if (!ok) return;
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          setEnabled(true);
          const res = await fetch("/api/push/prefs", { cache: "no-store" });
          const data = await res.json();
          if (data?.ok) setPrefs(data.prefs);
        }
      } catch {
        // Treat as not subscribed.
      }
    })();
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapid) throw new Error("Push is not configured yet.");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notifications are blocked. Allow them in your browser settings and try again.");
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
        }));

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ subscription: sub.toJSON(), device: deviceLabel() }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error("Couldn't save this device. Try again.");

      const prefsRes = await fetch("/api/push/prefs", { cache: "no-store" });
      const prefsData = await prefsRes.json();
      setPrefs(prefsData?.ok ? prefsData.prefs : { td: true, closeGame: false, final: true });
      setEnabled(true);
    } catch (e: any) {
      setError(e?.message || "Couldn't enable notifications.");
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEnabled(false);
      setPrefs(null);
    } catch {
      setError("Couldn't disable notifications on this device.");
    } finally {
      setBusy(false);
    }
  }, []);

  const setPref = useCallback(async (key: keyof Prefs, value: boolean) => {
    setPrefs((p) => (p ? { ...p, [key]: value } : p)); // optimistic
    try {
      await fetch("/api/push/prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ [key]: value }),
      });
    } catch {
      // Re-sync on next load; the optimistic value stands for now.
    }
  }, []);

  // Unsupported browsers without the iOS-install path: hide entirely.
  if (supported === null || (!supported && !needsInstall)) return null;

  return (
    <div className="bg-pitch-900 rounded-xl border border-pitch-700 shadow-lg shadow-black/30 overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3 border-b border-pitch-700/60">
        <div className="w-9 h-9 rounded-lg bg-accent-strong/10 border border-accent-strong/25 flex items-center justify-center">
          <Bell className="w-[18px] h-[18px] text-accent" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-display text-xl tracking-[0.06em] text-white leading-none">NOTIFICATIONS</h2>
          <p className="text-xs text-gray-500 mt-1">
            Game-day alerts for your teams. Touchdowns and finals by default.
          </p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {needsInstall ? (
          <div className="flex items-start gap-3 text-sm text-gray-400">
            <Smartphone className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" aria-hidden="true" />
            <p>
              On iPhone, add League Blitz to your Home Screen first (Share, then
              &quot;Add to Home Screen&quot;), then open it from there to turn on notifications.
            </p>
          </div>
        ) : !enabled ? (
          <button
            onClick={enable}
            disabled={busy}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 bg-accent-strong hover:bg-accent text-pitch-950 font-bold rounded-lg transition-colors font-ui tracking-wider text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-950"
          >
            <Bell className="w-4 h-4" aria-hidden="true" />
            {busy ? "Enabling..." : "Enable on this device"}
          </button>
        ) : (
          <>
            <ul className="space-y-1">
              {PREF_ROWS.map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-3 min-h-[44px]">
                  <div>
                    <p className="text-sm font-semibold text-gray-200">{row.label}</p>
                    <p className="text-xs text-gray-500">{row.hint}</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={prefs?.[row.key] ?? false}
                    aria-label={row.label}
                    onClick={() => setPref(row.key, !(prefs?.[row.key] ?? false))}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-900 ${
                      prefs?.[row.key] ? "bg-accent" : "bg-pitch-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                        prefs?.[row.key] ? "translate-x-[22px]" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={disable}
              disabled={busy}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 border border-pitch-600 hover:border-gray-500 text-gray-400 hover:text-gray-200 font-semibold rounded-lg transition-colors text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-900"
            >
              <BellOff className="w-4 h-4" aria-hidden="true" />
              Turn off on this device
            </button>
          </>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <p className="text-[11px] text-gray-600 leading-relaxed">
          Notifications cover your matchups only: scores and game results. No promotions, ever.
        </p>
      </div>
    </div>
  );
}
