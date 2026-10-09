import { useDisplaySettings } from '../store/useDisplaySettings';
import { scoreboardCapacity, useDisplaySize } from '../hooks/useDisplaySize';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { playEventSound } from '../lib/sounds';
import { ArenaIcon, type IconName } from './ui/ArenaIcon';
import { Avatar, RankEmblem, elapsed, eventIcons, number, rankBy, tierForRank } from './shared';
import type { CiAlert, DevStats, FeedItem, Member, SeasonRecap, ShamePR } from '../types';
import './extras.css';

const MIN = 60000, DAY = 86400000;
const params = () => new URLSearchParams(window.location.search);
const utcDay = (t: string | number) => new Date(t).toISOString().slice(0, 10);
const nameOf = (members: Member[], login: string) => members.find(m => m.login === login)?.name || login;

/** Day-of-month "round" and the end-of-season states. */
export function seasonClock(periodStart: string, now: number) {
  const start = Date.parse(`${periodStart}T00:00:00Z`), d = new Date(start);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const total = Math.round((end - start) / DAY);
  const round = Math.min(total, Math.max(1, Math.floor((now - start) / DAY) + 1));
  const left = Math.max(0, Math.ceil((end - now) / DAY));
  return { total, round, left, matchPoint: left > 0 && left <= 2, finalRound: left > 0 && left <= 1 };
}

export function MatchPointChip({ periodStart, now }: { periodStart: string; now: number }) {
  const clock = seasonClock(periodStart, now);
  return clock.matchPoint ? <span className="match-point"><i/>{clock.finalRound ? 'FINAL ROUND' : 'MATCH POINT'}</span> : null;
}

/** Players with 3+ scored plays in the last hour. */
export function hotLogins(feed: FeedItem[], now: number) {
  const counts: Record<string, number> = {};
  for (const item of feed) if (item.xp > 0 && now - Date.parse(item.time) < 60 * MIN) counts[item.user] = (counts[item.user] || 0) + 1;
  return new Set(Object.keys(counts).filter(login => counts[login] >= 3));
}

export function OnFireChip({ size = 14 }: { size?: number }) { return <span className="on-fire"><ArenaIcon name="flame" size={size}/>ON FIRE</span>; }

export interface KillLine { id: string; item: FeedItem; tag?: 'FIRST BLOOD' | 'ACE' }

/**
 * Watches live arrivals (not the backlog loaded at start) for the kill feed,
 * First Blood (first scored play of the UTC day), ACE (5 scored plays in 15
 * minutes) and top-3 tier promotions, queueing the matching moments.
 */
export function useArenaMoments() {
  const feed = useStore(s => s.feed), members = useStore(s => s.members), stats = useStore(s => s.stats), pushOverlay = useStore(s => s.pushOverlay);
  const [lines, setLines] = useState<KillLine[]>([]);
  const [lastLive, setLastLive] = useState(0);
  const seen = useRef<Set<string> | null>(null), aced = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!feed.length) return;
    if (!seen.current) { seen.current = new Set(feed.map(f => f.id)); return; }
    const now = Date.now();
    const fresh = feed.filter(f => !seen.current!.has(f.id) && now - Date.parse(f.time) < 15 * MIN).reverse();
    feed.forEach(f => seen.current!.add(f.id));
    if (!fresh.length) return;
    setLastLive(now);
    const added: KillLine[] = [];
    for (const item of fresh) {
      let tag: KillLine['tag'];
      if (item.xp > 0) {
        const day = utcDay(item.time), at = Date.parse(item.time);
        const earlier = feed.some(f => f.id !== item.id && f.xp > 0 && utcDay(f.time) === day && Date.parse(f.time) < at);
        let claimed: string | null = null;
        try { claimed = localStorage.getItem('gitarena-first-blood'); } catch { /* storage unavailable */ }
        if (!earlier && claimed !== day) {
          tag = 'FIRST BLOOD';
          try { localStorage.setItem('gitarena-first-blood', day); } catch { /* storage unavailable */ }
          pushOverlay({ type: 'first-blood', payload: { login: item.user } });
        } else if (feed.filter(f => f.user === item.user && f.xp > 0 && now - Date.parse(f.time) < 15 * MIN).length >= 5 && now - (aced.current[item.user] || 0) > 60 * MIN) {
          aced.current[item.user] = now;
          tag = 'ACE';
          pushOverlay({ type: 'ace', payload: { login: item.user } });
        }
      }
      added.push({ id: `${item.id}-${now}`, item, tag });
    }
    setLines(current => [...added.reverse(), ...current].slice(0, 4));
  }, [feed, pushOverlay]);
  useEffect(() => { if (!lines.length) return; const id = setTimeout(() => setLines(l => l.slice(0, -1)), 7000); return () => clearTimeout(id); }, [lines]);

  const top = useMemo(() => rankBy(members, stats).slice(0, 3).filter(m => (stats[m.login]?.monthlyXp || 0) > 0).map(m => m.login).join('|'), [members, stats]);
  const tiers = useRef<Record<string, number> | null>(null);
  useEffect(() => {
    const logins = top ? top.split('|') : [];
    if (!logins.length) { tiers.current = null; return; }
    const previous = tiers.current;
    tiers.current = Object.fromEntries(logins.map((login, i) => [login, i]));
    if (!previous) return;
    const promoted = logins.findIndex((login, i) => previous[login] === undefined || previous[login] > i);
    if (promoted >= 0) pushOverlay({ type: 'tier-up', payload: { login: logins[promoted], tier: tierForRank(promoted) } });
  }, [top, pushOverlay]);
  return { lines, lastLive };
}

export function KillFeed({ lines, members }: { lines: KillLine[]; members: Member[] }) {
  return <div className="kill-feed" aria-live="polite"><AnimatePresence initial={false}>{lines.map(({ id, item, tag }) => {
    const member = members.find(m => m.login === item.user);
    return <motion.div key={id} layout className={`kill-line ${tag ? 'kill-line--tagged' : ''}`} initial={{ opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 80 }} transition={{ duration: 0.3 }}>
      {tag && <span className="kill-tag">{tag}</span>}
      <Avatar member={member}/><strong>{member?.name || item.user}</strong>
      <span className="kill-weapon"><ArenaIcon name={eventIcons[item.type] || 'spark'} size={18}/></span>
      <span className="kill-target">{item.repo || item.detail}</span>
      {item.xp > 0 && <b>+{item.xp}</b>}
    </motion.div>;
  })}</AnimatePresence></div>;
}

/** After-hours window in UTC hours, `?quiet=20-7` (default) or `?quiet=off`. */
export function useQuiet(now: number, lastLive: number) {
  const spec = params().get('quiet') ?? '20-7';
  const [from, to] = spec.split('-').map(Number);
  if (spec === 'off' || !Number.isFinite(from) || !Number.isFinite(to)) return { quiet: false, until: 0 };
  const hour = new Date(now).getUTCHours();
  const inWindow = from > to ? hour >= from || hour < to : hour >= from && hour < to;
  return { quiet: inWindow && Date.now() - lastLive > 2 * MIN, until: to };
}

export function QuietScreen({ now, until }: { now: number; until: number }) {
  const members = useStore(s => s.members), stats = useStore(s => s.stats);
  const leader = rankBy(members, stats)[0], xp = leader ? stats[leader.login]?.monthlyXp || 0 : 0;
  return <motion.div className="quiet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2 }}>
    <div className="quiet-drift">
      <span className="tk-kicker"><ArenaIcon name="clock" size={16}/> OFF THE CLOCK</span>
      <strong className="quiet-clock">{new Date(now).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })}<small>UTC</small></strong>
      {leader && xp > 0 && <div className="quiet-leader"><RankEmblem tier="radiant" size={46}/><span>{leader.name}</span><b>{number(xp)} XP</b></div>}
      <small className="quiet-note">Live again at {String(until).padStart(2, '0')}:00 UTC. New activity wakes the arena.</small>
    </div>
  </motion.div>;
}

type Kind = 'spike' | 'scoreboard' | 'recap' | 'rivalry' | 'play' | 'radar';
type Snapshot = ReturnType<typeof useStore.getState>;
const order: Kind[] = ['spike', 'scoreboard', 'rivalry', 'recap', 'play', 'radar'];
const takeoverSeconds = (kind: Kind) => kind === 'recap' ? 15 : kind === 'scoreboard' ? 13 : 9;

function buildTakeover(kind: Kind, s: Snapshot, forced: boolean) {
  if (kind === 'spike') return s.ciAlerts.length ? { kind, alerts: s.ciAlerts } : null;
  if (kind === 'scoreboard') return Object.values(s.stats).filter(x => x.monthlyXp > 0).length >= 2 ? { kind } : null;
  if (kind === 'rivalry') {
    const ranked = rankBy(s.members, s.stats).filter(m => (s.stats[m.login]?.monthlyXp || 0) > 0).slice(0, 8);
    let best: { a: Member; b: Member; rank: number; gap: number } | null = null;
    for (let i = 0; i + 1 < ranked.length; i++) {
      const gap = (s.stats[ranked[i].login]?.monthlyXp || 0) - (s.stats[ranked[i + 1].login]?.monthlyXp || 0);
      if (!best || gap < best.gap) best = { a: ranked[i], b: ranked[i + 1], rank: i, gap };
    }
    return best && { kind, ...best };
  }
  if (kind === 'play') {
    const today = utcDay(Date.now());
    const item = s.feed.filter(f => f.xp > 0 && utcDay(f.time) === today).sort((a, b) => b.xp - a.xp || Date.parse(b.time) - Date.parse(a.time))[0];
    return item ? { kind, item } : null;
  }
  if (kind === 'radar') return s.shamePRs.length ? { kind, prs: s.shamePRs.slice(0, 4), total: s.shamePRs.length } : null;
  const recent = Date.now() - Date.parse(`${s.monthStartDate}T00:00:00Z`) < 5 * DAY;
  if (s.lastSeason && (recent || forced)) return { kind, season: s.lastSeason };
  if (!forced) return null;
  const standings = rankBy(s.members, s.stats).map(m => s.stats[m.login]).filter((x): x is DevStats => !!x && x.monthlyXp > 0).map(x => ({ login: x.login, xp: x.monthlyXp, commits: x.monthlyCommits, merges: x.monthlyPRsMerged, reviews: x.monthlyPRsReviewed, streak: x.longestStreak || x.streak }));
  return { kind, season: { month: s.monthStartDate, teamXp: standings.reduce((n, x) => n + x.xp, 0), standings } as SeasonRecap };
}
type Takeover = NonNullable<ReturnType<typeof buildTakeover>>;

/**
 * Full-screen interludes every `?takeoverEvery=` seconds (default 300):
 * failing-build spike, tab scoreboard,
 * rivalry VS, play of the day, review radar, and the season recap in the
 * first days of a month. `?takeover=<kind>` previews one kind on a loop.
 */
export function Takeovers({ blocked }: { blocked: boolean }) {
  const takeoverInterval = useDisplaySettings(s => s.preferences.takeoverSeconds);
  const members = useStore(s => s.members);
  const { width, height } = useDisplaySize();
  const [show, setShow] = useState<Takeover | null>(null);
  const blockedRef = useRef(blocked), cursor = useRef(0);
  blockedRef.current = blocked;
  useEffect(() => {
    const forced = order.includes(params().get('takeover') as Kind) ? params().get('takeover') as Kind : null;
    const every = Math.max(20, Number(params().get('takeoverEvery')) || takeoverInterval) * 1000;
    const run = () => {
      if (blockedRef.current) return;
      const s = useStore.getState();
      for (let n = 0; n < order.length; n++) {
        const kind = forced || order[(cursor.current + n) % order.length];
        const next = buildTakeover(kind, s, !!forced);
        if (next) { cursor.current = (order.indexOf(kind) + 1) % order.length; setShow(next); playEventSound(kind === 'radar' || kind === 'spike' ? 'spike' : 'interstitial'); return; }
        if (forced) return;
      }
    };
    const first = forced ? setTimeout(run, 4000) : undefined;
    const id = setInterval(run, forced ? 20000 : every);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [takeoverInterval]);
  const duration = show ? show.kind === 'scoreboard'
    ? Math.max(13, Math.ceil(members.length / scoreboardCapacity(width, height)) * 3.5 + 1)
    : takeoverSeconds(show.kind) : 0;
  useEffect(() => { if (!show) return; const id = setTimeout(() => setShow(null), duration * 1000); return () => clearTimeout(id); }, [show, duration]);
  return <AnimatePresence>{show && <motion.div key={show.kind} className={`takeover takeover--${show.kind}`} initial={{ clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)' }} animate={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }} exit={{ opacity: 0 }} transition={{ duration: 0.55, ease: [0.7, 0, 0.3, 1] }}>
    {show.kind === 'spike' && <SpikeTakeover alerts={show.alerts} members={members}/>}
    {show.kind === 'scoreboard' && <Scoreboard/>}
    {show.kind === 'rivalry' && <Rivalry {...show}/>}
    {show.kind === 'play' && <PlayOfTheDay item={show.item} members={members}/>}
    {show.kind === 'radar' && <ReviewRadar prs={show.prs} total={show.total}/>}
    {show.kind === 'recap' && <Recap season={show.season} members={members}/>}
    <motion.span className="takeover-timer" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration, ease: 'linear' }}/>
  </motion.div>}</AnimatePresence>;
}

function VsSide({ member, xp, rank, side }: { member: Member; xp: number; rank: number; side: 'a' | 'b' }) {
  const tier = tierForRank(rank);
  return <motion.div className={`tk-side tk-side--${side}`} initial={{ opacity: 0, x: side === 'a' ? -120 : 120 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25, type: 'spring', stiffness: 120, damping: 18 }}>
    <div className="tk-side-art">{member.avatarUrl ? <img src={member.avatarUrl} alt=""/> : <Avatar member={member}/>}</div>
    <div className="tk-side-copy">{tier ? <RankEmblem tier={tier} size={54}/> : <span className="tk-rank">#{rank + 1}</span>}<h2>{member.name}</h2><b>{number(xp)} XP</b></div>
  </motion.div>;
}

function Rivalry({ a, b, rank, gap }: { a: Member; b: Member; rank: number; gap: number }) {
  const stats = useStore(s => s.stats);
  return <div className="tk-vs">
    <VsSide member={a} xp={stats[a.login]?.monthlyXp || 0} rank={rank} side="a"/>
    <motion.div className="tk-vs-mark" initial={{ scale: 3, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ delay: 0.6, type: 'spring', stiffness: 200, damping: 14 }}>VS</motion.div>
    <VsSide member={b} xp={stats[b.login]?.monthlyXp || 0} rank={rank + 1} side="b"/>
    <motion.div className="tk-caption" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}><span className="tk-kicker">CLOSEST RIVALRY · #{rank + 1} VS #{rank + 2}</span><strong>{number(gap)} XP</strong><em>stands between them. One solid PR could flip it.</em></motion.div>
  </div>;
}

function PlayOfTheDay({ item, members }: { item: FeedItem; members: Member[] }) {
  const member = members.find(m => m.login === item.user);
  return <div className="tk-play">
    <motion.span className="tk-kicker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}><ArenaIcon name="star" size={18}/> PLAY OF THE DAY</motion.span>
    <motion.h1 initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>{member?.name || item.user}</motion.h1>
    <motion.div className="tk-play-card" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7 }}>
      <div className="tk-play-art">{member?.avatarUrl ? <img src={member.avatarUrl} alt=""/> : <Avatar member={member}/>}</div>
      <div className="tk-play-copy"><span><ArenaIcon name={eventIcons[item.type] || 'spark'} size={22}/>{item.message}</span><strong>{item.detail || item.repo}</strong><small>{item.repo} · {new Date(item.time).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })} UTC</small></div>
      <motion.b initial={{ scale: 2.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.1, type: 'spring', stiffness: 220, damping: 12 }}>+{item.xp}<small>XP</small></motion.b>
    </motion.div>
  </div>;
}

function ReviewRadar({ prs, total }: { prs: ShamePR[]; total: number }) {
  return <div className="tk-radar">
    <div className="tk-scope"><i/><span/><span/><span/>{prs.map((pr, i) => <motion.b key={i} style={{ left: `${50 + Math.cos(i * 1.9 + 0.6) * (18 + Math.min(pr.age, 96) / 4)}%`, top: `${50 + Math.sin(i * 1.9 + 0.6) * (18 + Math.min(pr.age, 96) / 4)}%` }} initial={{ scale: 0 }} animate={{ scale: [0, 1.4, 1] }} transition={{ delay: 0.6 + i * 0.35 }}/>)}</div>
    <div className="tk-radar-list">
      <span className="tk-kicker"><ArenaIcon name="review" size={18}/> REVIEW RADAR</span>
      <h1>{total} PR{total === 1 ? '' : 's'} waiting</h1>
      {prs.map((pr, i) => <motion.div key={i} className="tk-pr" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.2 }}><div><strong>{pr.title}</strong><small>{pr.repo} · by {pr.author}</small></div><b className={pr.age >= 48 ? 'is-hot' : ''}>{pr.age}H</b></motion.div>)}
      <em>A review is worth 60 XP. Clear the queue.</em>
    </div>
  </div>;
}

function Recap({ season, members }: { season: SeasonRecap; members: Member[] }) {
  const top = season.standings.slice(0, 3);
  const month = new Date(`${season.month}T00:00:00Z`).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const award = (label: string, icon: IconName, key: 'commits' | 'merges' | 'reviews' | 'streak', unit: string) => {
    const best = [...season.standings].sort((a, b) => b[key] - a[key])[0];
    return best && best[key] > 0 ? <div className="tk-award" key={key}><ArenaIcon name={icon} size={22}/><span>{label}</span><strong>{nameOf(members, best.login)}</strong><b>{number(best[key])} {unit}</b></div> : null;
  };
  return <div className="tk-recap">
    <motion.span className="tk-kicker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}><ArenaIcon name="trophy" size={18}/> SEASON RECAP · {month.toUpperCase()}</motion.span>
    <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>Final standings</motion.h1>
    <div className="tk-podium">{[1, 0, 2].map(i => {
      const entry = top[i]; if (!entry) return <div key={i}/>;
      const member = members.find(m => m.login === entry.login);
      return <motion.div key={i} className={`tk-step tk-step--${tierForRank(i)}`} initial={{ opacity: 0, y: 90 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 + (2 - i) * 0.35, type: 'spring', stiffness: 110, damping: 16 }}>
        <RankEmblem tier={tierForRank(i)!} size={i === 0 ? 92 : 70}/>
        <Avatar member={member}/>
        <strong>{member?.name || entry.login}</strong>
        <b>{number(entry.xp)} XP</b>
        <div className="tk-block"><span>{i + 1}</span><small>{tierForRank(i)}</small></div>
      </motion.div>;
    })}</div>
    <motion.div className="tk-awards" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}>
      {award('Most commits', 'git', 'commits', 'commits')}{award('Top closer', 'merge', 'merges', 'merges')}{award('Top reviewer', 'review', 'reviews', 'reviews')}{award('Longest streak', 'flame', 'streak', 'days')}
      <div className="tk-award"><ArenaIcon name="users" size={22}/><span>Team total</span><strong>{season.standings.length} players</strong><b>{number(season.teamXp)} XP</b></div>
    </motion.div>
  </div>;
}

const since = (time: string) => { const m = Math.max(0, Math.floor((Date.now() - Date.parse(time)) / MIN)); return m < 60 ? `${m}M` : `${Math.floor(m / 60)}H ${m % 60}M`; };

export function SpikeChip() {
  const alerts = useStore(s => s.ciAlerts);
  if (!alerts.length) return null;
  return <span className="spike-chip" title={alerts.map(a => `${a.repo}/${a.branch}: ${a.workflow}`).join('\n')}><SpikeGlyph size={16}/>{alerts.length === 1 ? `SPIKE · ${alerts[0].repo.toUpperCase()}` : `${alerts.length} SPIKES PLANTED`}</span>;
}

export function SpikeGlyph({ size = 120 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true"><path d="M24 3 40 24 24 45 8 24Z" fill="#2a0a12" stroke="#ff4d6d" strokeWidth="2.4"/><path d="M24 11v26M16 24h16" stroke="#ff4d6d" strokeWidth="2.4" strokeLinecap="round"/><circle cx="24" cy="24" r="4.2" fill="#ff4d6d"/></svg>;
}

function SpikeTakeover({ alerts, members }: { alerts: CiAlert[]; members: Member[] }) {
  return <div className="tk-spike">
    <motion.div className="tk-spike-icon" animate={{ scale: [1, 1.07, 1] }} transition={{ repeat: Infinity, duration: 0.85 }}><SpikeGlyph size={300}/></motion.div>
    <div className="tk-radar-list">
      <span className="tk-kicker tk-kicker--red"><ArenaIcon name="alert" size={18}/> BUILD BROKEN</span>
      <h1>Spike planted</h1>
      {alerts.slice(0, 4).map((a, i) => <motion.div key={`${a.repo}:${a.branch}`} className="tk-pr tk-pr--red" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.2 }}><div><strong>{a.repo} / {a.branch}</strong><small>{a.workflow}{a.actor ? ` · pushed by ${nameOf(members, a.actor)}` : ''}</small></div><b>{since(a.since)}</b></motion.div>)}
      <em>Get the build green to defuse it.</em>
    </div>
  </div>;
}

function Scoreboard() {
  const members = useStore(s => s.members), stats = useStore(s => s.stats), feed = useStore(s => s.feed), activeDays = useStore(s => s.activeDays);
  const ranked = rankBy(members, stats);
  const { width, height } = useDisplaySize();
  const capacity = scoreboardCapacity(width, height);
  const pages = Math.max(1, Math.ceil(ranked.length / capacity));
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
    if (pages <= 1) return;
    const timer = setInterval(() => setPage(p => (p + 1) % pages), 3500);
    return () => clearInterval(timer);
  }, [pages]);
  const shown = ranked.slice((page % pages) * capacity, ((page % pages) + 1) * capacity);
  const hot = hotLogins(feed, Date.now());
  const perDay = (login: string) => { const s = stats[login]; const d = activeDays[login] || 0; return s && d ? Math.round(s.monthlyXp / d) : 0; };
  const cols: Array<{ key: string; label: string; value: (m: Member) => number; fmt?: (n: number, m: Member) => string }> = [
    { key: 'xp', label: 'XP', value: m => stats[m.login]?.monthlyXp || 0 },
    { key: 'commits', label: 'Commits', value: m => stats[m.login]?.monthlyCommits || 0 },
    { key: 'merges', label: 'Merges', value: m => stats[m.login]?.monthlyPRsMerged || 0 },
    { key: 'reviews', label: 'Reviews', value: m => stats[m.login]?.monthlyPRsReviewed || 0 },
    { key: 'perday', label: 'XP / day', value: m => perDay(m.login) },
    { key: 'streak', label: 'Streak', value: m => stats[m.login]?.streak || 0, fmt: n => `${n}D` },
  ];
  const best = Object.fromEntries(cols.map(c => [c.key, Math.max(0, ...ranked.map(c.value))]));
  const last = (login: string) => { const t = feed.find(f => f.user === login)?.time || stats[login]?.lastActivityTime; return t ? elapsed(t, Date.now()) : '—'; };
  return <div className="tk-board">
    <div className="tk-board-head"><span className="tk-kicker"><ArenaIcon name="users" size={18}/> SCOREBOARD · THIS MONTH</span><h1>Scoreboard</h1>{pages > 1 && <small className="tk-board-page">{page % pages + 1} / {pages}</small>}</div>
    <div className="tk-table" style={{ gridTemplateRows: `auto repeat(${shown.length}, minmax(0, 1fr))` }}>
      <div className="tk-row tk-row--head"><span>#</span><span>Player</span>{cols.map(c => <span key={c.key}>{c.label}</span>)}<span>Last play</span></div>
      {shown.map((m, row) => {
        const i = (page % pages) * capacity + row;
        const xp = stats[m.login]?.monthlyXp || 0, tier = tierForRank(i, xp);
        return <motion.div key={m.login} className={`tk-row ${tier ? `tk-row--${tier}` : 'tk-row--unranked'}`} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.05 }}>
          <span className="tk-rank">{tier ? <RankEmblem tier={tier} size={30}/> : null}<b>{i + 1}</b></span>
          <span className="tk-player"><Avatar member={m}/><strong>{m.name}</strong>{hot.has(m.login) && <ArenaIcon name="flame" size={16} className="tk-hot"/>}{!tier && <small>UNRANKED</small>}</span>
          {cols.map(c => { const v = c.value(m); return <span key={c.key} className={`tk-num ${v > 0 && v === best[c.key] ? 'is-best' : ''}`}>{c.fmt ? c.fmt(v, m) : number(v)}</span>; })}
          <span className="tk-last">{last(m.login)}</span>
        </motion.div>;
      })}
    </div>
  </div>;
}
