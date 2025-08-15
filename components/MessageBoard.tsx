
'use client';
import React, { useEffect, useState } from "react";

type Message = {
  id: number;
  user: string;
  text: string;
  time: string;
};

export default function MessageBoard() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [user, setUser] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/messages")
      .then((res) => res.json())
      .then(setMessages);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.trim() || !text.trim()) return;
    setLoading(true);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, text }),
    });
    if (res.ok) {
      const msg = await res.json();
      setMessages((msgs) => [...msgs, msg]);
      setText("");
    }
    setLoading(false);
  };

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-4">
      <h2 className="text-lg font-semibold mb-2">Message Board</h2>
      <div className="max-h-64 overflow-y-auto space-y-2">
        {messages.length === 0 && <div className="text-gray-400 text-sm">No messages yet.</div>}
        {messages.map((msg: any) => (
          <div key={msg.id} className="bg-gray-900 rounded p-2 text-sm">
            <span className="font-bold text-blue-300">{msg.user}:</span> {msg.text}
            <span className="block text-xs text-gray-500 mt-1">{new Date(msg.time).toLocaleString()}</span>
          </div>
        ))}
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end"
      >
        <input
          className="flex-1 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-white"
          placeholder="Your name"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          required
        />
        <input
          className="flex-1 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-white"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50 w-full sm:w-auto"
          disabled={loading}
        >
          Send
        </button>
      </form>
    </div>
  );
}
