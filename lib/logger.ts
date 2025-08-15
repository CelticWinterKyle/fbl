import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs", "ai");
const EPHEMERAL = !!process.env.VERCEL; // Vercel serverless: no persistent writable FS

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

export function logAI(event: any) {
  try {
    if (EPHEMERAL) {
      // Fallback: emit to stdout so logs appear in platform log tail
      console.log("[AI_LOG]", JSON.stringify(event));
      return;
    }
    ensureDir();
    const d = new Date();
    const file = path.join(LOG_DIR, `${d.toISOString().slice(0,10)}.jsonl`);
    const line = JSON.stringify({ ts: d.toISOString(), ...event }) + "\n";
    fs.appendFileSync(file, line, { encoding: "utf8" });
  } catch {}
}

export function listLogFiles(): string[] {
  if (EPHEMERAL) return [];
  try {
    ensureDir();
    return fs.readdirSync(LOG_DIR).filter(f => f.endsWith(".jsonl")).sort();
  } catch { return []; }
}

export function readLog(dateISO: string): any[] {
  if (EPHEMERAL) return [];
  try {
    ensureDir();
    const file = path.join(LOG_DIR, `${dateISO}.jsonl`);
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, "utf8").split(/\n+/).filter(Boolean);
    return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

export function getLogFilePath(dateISO: string): string {
  ensureDir();
  return path.join(LOG_DIR, `${dateISO}.jsonl`);
}

export function readLogRaw(dateISO: string): string {
  if (EPHEMERAL) return "";
  try {
    const file = getLogFilePath(dateISO);
    if (!fs.existsSync(file)) return "";
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}
