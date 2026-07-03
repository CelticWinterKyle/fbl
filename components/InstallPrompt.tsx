"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Download, X, Share } from "lucide-react";

const DISMISS_KEY = "lb:install-dismissed";

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const deferredPrompt = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const ios = /iPhone|iPad/.test(navigator.userAgent) && !(window as any).MSStream;
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

    if (ios && isSafari) {
      setIsIos(true);
      setShow(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e;
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = useCallback(() => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, "1");
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt.current) return;
    deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === "accepted") dismiss();
    deferredPrompt.current = null;
  }, [dismiss]);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md" style={{ animation: "install-slide-up 0.3s ease-out" }}>
      <div className="bg-pitch-800 border border-pitch-600 rounded-xl shadow-2xl shadow-black/50 p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent-strong/10 border border-accent-strong/25 flex items-center justify-center shrink-0">
            <Download className="w-[18px] h-[18px] text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-200">
              Add League Blitz to your home screen
            </p>
            {isIos ? (
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Tap <Share className="inline w-3 h-3 -mt-0.5" /> Share, then &quot;Add to Home Screen&quot; for the full app experience with notifications.
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Get the full-screen app experience with push notifications.
              </p>
            )}
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 p-1 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {!isIos && (
          <button
            onClick={install}
            className="mt-3 w-full min-h-[44px] inline-flex items-center justify-center gap-2 bg-accent-strong hover:bg-accent text-pitch-950 font-bold rounded-lg transition-colors tracking-wider text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-800"
          >
            <Download className="w-4 h-4" />
            Install
          </button>
        )}
      </div>
    </div>
  );
}
