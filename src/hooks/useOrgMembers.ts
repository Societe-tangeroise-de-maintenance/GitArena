import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { fetchOrgMembers } from '../lib/github';

const COLORS = ['#3b82f6', '#a78bfa', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316'];

export function useOrgMembers() {
  const isDemo = useStore((s) => s.isDemo);
  const setMembers = useStore((s) => s.setMembers);
  const members = useStore((s) => s.members);

  useEffect(() => {
    if (isDemo) return;

    let cancelled = false;

    async function load() {
      try {
        const raw = await fetchOrgMembers();
        if (cancelled || raw.length === 0) return;
        const memberList = raw.map((m, i) => ({
          login: m.login,
          name: m.name || m.login,
          color: COLORS[i % COLORS.length],
          avatarUrl: m.avatarUrl || '',
        }));
        setMembers(memberList);
      } catch {
        // Will rely on auto-discovery from events
      }
    }

    load();
    return () => { cancelled = true; };
  }, [isDemo, setMembers, members.length]);
}
