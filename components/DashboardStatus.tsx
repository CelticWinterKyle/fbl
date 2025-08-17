"use client";
import { useEffect, useState } from "react";

type Status = {
  ok: boolean;
  userId?: string;
  reason?: string | null;
  userLeague?: string | null;
};

interface DashboardStatusProps {
  onStatusReady: (status: Status) => void;
  children: React.ReactNode;
}

export default function DashboardStatus({ onStatusReady, children }: DashboardStatusProps) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await fetch('/api/yahoo/status', { cache: 'no-store' });
        const data = await response.json();
        setStatus(data);
        onStatusReady(data);
      } catch (error) {
        console.error('Failed to fetch status:', error);
        setStatus({ ok: false });
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
  }, [onStatusReady]);

  if (loading) {
    return <div className="p-8">Loading dashboard...</div>;
  }

  if (!status?.ok) {
    return <div className="p-8">Failed to load dashboard status.</div>;
  }

  return <>{children}</>;
}
