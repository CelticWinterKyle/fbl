import OpenAI from "openai";
import { logAI } from "./logger";

let _client: OpenAI | null = null;
function getOpenAI() {
	if (_client) return _client;
	const key = process.env.OPENAI_API_KEY;
	if (!key) return null;
	_client = new OpenAI({ apiKey: key });
	return _client;
}

export async function chatCompletion({ messages, model = "gpt-3.5-turbo", logTag, ...opts }: { messages: any[], model?: string, logTag?: string, [key: string]: any }) {
	if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set in environment");
	const started = Date.now();
	const req: any = { model, messages, ...opts };
	if (logTag) {
		try { logAI({ tag: logTag, direction: "request", model, messages: req.messages, options: { ...req, messages: undefined } }); } catch {}
	}
	try {
		const client = getOpenAI();
		if (!client) throw new Error("OPENAI_API_KEY missing");
		const res = await client.chat.completions.create(req);
		if (logTag) {
			try { logAI({ tag: logTag, direction: "response", model, ms: Date.now()-started, response: res }); } catch {}
		}
		return res;
	} catch (err:any) {
		if (logTag) {
			try { logAI({ tag: logTag, direction: "error", model, ms: Date.now()-started, error: String(err?.message||err) }); } catch {}
		}
		throw err;
	}
}
