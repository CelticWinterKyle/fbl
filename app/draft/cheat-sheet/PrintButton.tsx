"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 bg-accent hover:bg-accent-soft text-pitch-950 font-bold py-2.5 px-6 rounded-lg tracking-wide transition-colors text-sm"
    >
      <Printer className="w-4 h-4" aria-hidden="true" />
      Print this sheet
    </button>
  );
}
