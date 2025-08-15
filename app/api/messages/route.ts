import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

const filePath = path.join(process.cwd(), 'data', 'messages.json');

export async function GET() {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    const messages = JSON.parse(data);
    return NextResponse.json(messages);
  } catch (e) {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, text } = await req.json();
    if (!text || !user) return NextResponse.json({ error: 'Missing user or text' }, { status: 400 });
    const data = fs.readFileSync(filePath, 'utf-8');
    const messages = JSON.parse(data);
    const newMsg = { id: Date.now(), user, text, time: new Date().toISOString() };
    messages.push(newMsg);
    fs.writeFileSync(filePath, JSON.stringify(messages, null, 2));
    return NextResponse.json(newMsg);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
  }
}
