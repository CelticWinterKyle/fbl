import { listLogFiles, readLog } from "@/lib/logger";

export const dynamic = "force-dynamic";

export default function AiLogsPage() {
  const files = listLogFiles();
  const ephemeral = !!process.env.VERCEL;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">AI Prompt Logs</h1>
      {ephemeral && (
        <div className="text-xs text-amber-400 border border-amber-600/30 bg-amber-900/20 rounded p-2">
          Running on Vercel: file logs are not persisted; events are emitted to platform logs (stdout). Attach external storage (S3/DB) for persistence.
        </div>
      )}
      {files.length === 0 ? (
        <div className="text-sm text-gray-400">No logs yet.</div>
      ) : (
        <div className="space-y-6">
          {files.map((f) => {
            const date = f.replace(/\.jsonl$/,"");
            const rows = readLog(date);
            return (
              <section key={f} className="rounded border border-gray-800 bg-gray-900 p-3">
                <div className="mb-2 flex items-center gap-3">
                  <div className="text-sm text-gray-300 font-semibold">{date}</div>
                  <a className="text-xs text-blue-400 hover:underline" href={`/api/debug/ai-logs/${date}`}>Download .jsonl</a>
                </div>
                <ul className="space-y-2 text-xs">
                  {rows.map((r, i) => (
                    <li key={i} className="rounded bg-gray-950 border border-gray-800 p-2 overflow-x-auto">
                      <div className="text-[10px] text-gray-400 mb-1">{r.ts} · {r.tag} · {r.direction} {r.ms ? `· ${r.ms}ms` : ""}</div>
                      <pre className="whitespace-pre-wrap break-words">{JSON.stringify(r.direction === 'request' ? { model: r.model, messages: r.messages, options: r.options } : r, null, 2)}</pre>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
