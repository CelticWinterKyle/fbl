"use client";
import { useState } from "react";
import Card from "./Card";

export default function AiWeeklyRecap({ defaultWeek }: { defaultWeek?: number }) {
  const [loading, setLoading] = useState(false);
  const [md, setMd] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function runRecap() {
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "summary", week: defaultWeek }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || "Request failed");
      setMd(data.markdown);
    } catch (e: any) {
      setErr(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="AI Weekly Recap" action={
      <button
        onClick={runRecap}
        disabled={loading}
        className="text-xs rounded bg-blue-600 px-3 py-1.5 hover:bg-blue-500 disabled:opacity-50"
      >
        {loading ? "Generating..." : "Generate"}
      </button>
    }>
      {!md && !err && <div className="text-sm text-gray-400">Click Generate for a 5-bullet recap.</div>}
      {err && <div className="text-sm text-red-300">{err}</div>}
      {md && (
        <div className="prose prose-invert max-w-none text-sm">
          {md.split("\n").map((line, i) => <p key={i}>{line}</p>)}
        </div>
      )}
    </Card>
  );
}
