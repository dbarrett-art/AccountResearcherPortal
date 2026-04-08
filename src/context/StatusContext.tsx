import { createContext, useContext, useEffect, useState } from 'react';

interface StatusState {
  operational: boolean;
  indicator: 'none' | 'minor' | 'major' | 'critical';
  description: string;
  updated_at: string | null;
}

const WORKER_BASE = 'https://go.accountresearch.workers.dev';
const DEFAULT: StatusState = { operational: true, indicator: 'none', description: '', updated_at: null };

const StatusContext = createContext<StatusState>(DEFAULT);

export function StatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<StatusState>(DEFAULT);

  useEffect(() => {
    const fetchStatus = () => {
      fetch(`${WORKER_BASE}/anthropic-status`)
        .then(r => r.json())
        .then(setStatus)
        .catch(() => {});
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return <StatusContext.Provider value={status}>{children}</StatusContext.Provider>;
}

export const useStatus = () => useContext(StatusContext);
