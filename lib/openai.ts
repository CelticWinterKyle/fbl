import OpenAI from "openai";
import { logAI } from "./logger";

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function chatCompletion({ messages, model = "gpt-3.5-turbo", logTag, ...opts }: { messages: any[], model?: string, logTag?: string, [key: string]: any }) {
	if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set in environment");
	const started = Date.now();
	const req: any = { model, messages, ...opts };
	if (logTag) {
		try { logAI({ tag: logTag, direction: "request", model, messages: req.messages, options: { ...req, messages: undefined } }); } catch {}
	}
	try {
		const res = await openai.chat.completions.create(req);
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
