import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { ArenaIcon, type IconName } from '../ui/ArenaIcon';
import { AnimatedScore, Avatar, RankEmblem, UiSwitch, isTopTier, rankGap, tierForRank, compact, elapsed, eventIcons, number, rankBy, type UiMode } from '../shared';
import { getLevel } from '../../lib/xp';
import { getBadgeDef } from '../../lib/badges';
import { MatchPointChip, SpikeChip, seasonClock } from '../extras';
import type { DevStats, FeedItem, Member } from '../../types';
import './arena.css';
import { SpaceJourney } from './SpaceJourney';
import { LivingCity } from './LivingCity';
import { SettingsButton } from '../DisplaySettings';
import { goalDisplayKey, useDisplaySettings } from '../../store/useDisplaySettings';

/** Rotates through `count` positions on a timer; resets when `count` changes. */
function useTicker(count: number, ms: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setTick(0);
    if (count <= 1) return;
    const id = setInterval(() => setTick(t => (t + 1) % count), ms);
    return () => clearInterval(id);
  }, [count, ms]);
  return tick;
}

function TopBar({ now, periodStart, isDemo, memberCount, soundOn, onSound, uiMode, onUiMode }: { now: number; periodStart: string; isDemo: boolean; memberCount: number; soundOn: boolean; onSound: () => void; uiMode: UiMode; onUiMode: (mode: UiMode) => void }) {
  return <header className="as-top">
    <div className="as-brand"><ArenaIcon name="arena" size={30}/><span>GIT<b>ARENA</b></span></div>
    <div className="as-season-strip"><strong>{new Date(`${periodStart}T00:00:00Z`).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong><span>{Math.max(0, Math.ceil((Date.UTC(new Date(periodStart).getUTCFullYear(), new Date(periodStart).getUTCMonth() + 1, 1) - now) / 86400000))} DAYS LEFT <i/> ROUND {seasonClock(periodStart, now).round}/{seasonClock(periodStart, now).total}</span></div>
    <div className="as-top-spacer"/>
    <SpikeChip/>
    <MatchPointChip periodStart={periodStart} now={now}/>
    <span className="as-status"><i/>{isDemo ? 'DEMO' : 'LIVE'}</span>
    <span className="as-top-meta"><ArenaIcon name="users" size={17}/>{memberCount}</span>
    <span className="as-clock">{new Date(now).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })}<small>UTC</small></span>
    <UiSwitch mode={uiMode} onChange={onUiMode}/>
    <SettingsButton arena/>
    <button className="as-sound" onClick={onSound} aria-label={soundOn ? 'Mute sound' : 'Enable sound'}><ArenaIcon name={soundOn ? 'volume' : 'mute'} size={19}/></button>
  </header>;
}

function feedVerb(item: FeedItem) {
  if (item.type === 'branch-push') return item.detail.includes('linked') ? 'PUSHING' : 'PICKING…';
  return ({ commit: 'COMMITTED', 'pr-opened': 'OPENED PR', 'pr-merged': 'MERGED', review: 'REVIEWED', issue: 'CLOSED ISSUE', 'issue-opened': 'OPENED ISSUE', badge: 'UNLOCKED', streak: 'ON A STREAK', 'level-up': 'LEVELED UP' } as Record<string, string>)[item.type] || 'ACTIVE';
}

function PartyFeed({ feed, members, now }: { feed: FeedItem[]; members: Member[]; now: number }) {
  const recent = feed.slice(0, 10);
  const listRef = useRef<HTMLDivElement>(null);
  const [visibleRows, setVisibleRows] = useState(5);
  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const resize = () => {
      const row = node.querySelector<HTMLElement>('.as-party-row');
      const style = getComputedStyle(node);
      const available = node.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setVisibleRows(Math.max(1, Math.floor(available / (row?.offsetHeight || 76))));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node); resize();
    return () => observer.disconnect();
  }, [recent.length]);
  const [offset, setOffset] = useState(0);
  useEffect(() => { setOffset(0); }, [recent[0]?.id]);
  useEffect(() => { if (recent.length <= visibleRows) return; const id = setInterval(() => setOffset(o => (o + 1) % recent.length), 4200); return () => clearInterval(id); }, [recent.length, visibleRows]);
  const rows = recent.length ? [...recent.slice(offset), ...recent.slice(0, offset)] : [];
  return <section className="as-party">
    <div className="as-panel-head"><span><ArenaIcon name="bolt" size={16}/> THE PULSE</span><small><i/> LIVE</small></div>
    <div className="as-party-list" ref={listRef}>
      {rows.length === 0 && <div className="as-empty">WAITING FOR THE FIRST MOVE</div>}
      {rows.slice(0, visibleRows).map(item => { const member = members.find(m => m.login === item.user); return <motion.div layout key={item.id} className={`as-party-row ${item.id === recent[0]?.id ? 'is-latest' : ''}`} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
        <div className="as-hex"><Avatar member={member}/><span className="as-hex-badge"><ArenaIcon name={eventIcons[item.type] || 'spark'} size={13}/></span></div>
        <div className="as-party-copy"><strong>{member?.name || item.user}</strong><small>{feedVerb(item)} <b>·</b> {item.repo || item.detail}</small></div>
        <div className="as-party-meta"><strong>{item.type === 'branch-push' ? 'PR' : item.xp > 0 ? `+${item.xp}` : '—'}</strong><small>{elapsed(item.time, now)}</small></div>
      </motion.div>; })}
    </div>
  </section>;
}

function Abilities({ s }: { s?: DevStats }) {
  const items: Array<[IconName, number, string]> = [['git', s?.monthlyCommits || 0, 'Commits'], ['merge', s?.monthlyPRsMerged || 0, 'Merges'], ['review', s?.monthlyPRsReviewed || 0, 'Reviews'], ['flame', s?.streak || 0, 'Streak']];
  return <div className="as-abilities">{items.map(([icon, value, label]) => <span key={label} title={label}><ArenaIcon name={icon} size={17}/><b>{compact(value)}</b></span>)}</div>;
}

function AgentCard({ member, s, rank, focused, rose, onFire, gap }: { member: Member; s?: DevStats; rank: number; focused: boolean; rose: boolean; onFire: boolean; gap: string }) {
  const leader = rank === 0, tier = tierForRank(rank, s?.monthlyXp || 0), level = getLevel(s?.totalXp || 0);
  return <motion.article layout className={`as-card ${leader ? 'is-leader' : ''} ${focused ? 'is-focused' : ''} ${tier ? `as-card--${tier}` : 'as-card--unranked'} ${isTopTier(tier) ? 'as-card--top' : ''} ${onFire ? 'is-onfire' : ''}`} transition={{ layout: { type: 'spring', stiffness: 170, damping: 22 } }}>
    <div className="as-card-art">{member.avatarUrl ? <img src={member.avatarUrl} alt=""/> : <span style={{ background: member.color }}/>}</div>
    <header className="as-card-top">
      <span className="as-card-rank">{String(rank + 1).padStart(2, '0')}{onFire && <span className="as-card-fire" title="On fire: 3+ plays this hour"><ArenaIcon name="flame" size={16}/></span>}</span>
      {tier && <RankEmblem tier={tier} size={leader ? 62 : isTopTier(tier) ? 52 : 44}/>}
    </header>
    <AnimatePresence>{rose && <motion.span className="as-rankup" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}><ArenaIcon name="arrow" size={14}/> RANK UP</motion.span>}</AnimatePresence>
    <div className="as-plate">
      <div className="as-plate-line">
        <span className="as-plate-tag">{tier || 'unranked'}</span>
        <i/>
        <span title="Level comes from lifetime XP">{leader ? 'LOCKED IN' : `LVL ${level.level}`}</span>
      </div>
      <h3>{member.name}</h3>
      <AnimatedScore xp={s?.monthlyXp || 0} className="as-card-xp"/>
      {gap && <small className={`as-card-gap ${leader ? 'is-lead' : ''}`}><ArenaIcon name="arrow" size={12}/>{gap}</small>}
      <Abilities s={s}/>
    </div>
  </motion.article>;
}

function AgentCards({ ranked, stats, hot, fresh }: { ranked: Member[]; stats: Record<string, DevStats>; hot: Set<string>; fresh: Set<string> }) {
  const top = ranked.slice(0, 3), rest = ranked.slice(3);
  const rotationSeconds = useDisplaySettings(s => s.preferences.rotationSeconds);
  const offset = useTicker(Math.max(1, rest.length), rotationSeconds * 1000);
  const reduced = useReducedMotion();
  const previous = useRef<Record<string, number>>({});
  const [risen, setRisen] = useState<Record<string, boolean>>({});
  const order = ranked.map(m => m.login).join('|');
  useEffect(() => {
    const next: Record<string, number> = {}, up: Record<string, boolean> = {};
    ranked.forEach((m, i) => { next[m.login] = i; const before = previous.current[m.login]; if (before !== undefined && i < before) up[m.login] = true; });
    const hadHistory = Object.keys(previous.current).length > 0;
    previous.current = next;
    if (!hadHistory || !Object.keys(up).length) return;
    setRisen(up);
    const id = setTimeout(() => setRisen({}), 3500);
    return () => clearTimeout(id);
  }, [order]);
  const shown = Array.from({ length: Math.min(2, rest.length) }, (_, i) => {
    const index = (offset + i) % rest.length;
    return { member: rest[index], rank: 3 + index };
  });
  const card = (m: Member, rank: number) => <AgentCard key={m.login} member={m} s={stats[m.login]} rank={rank} focused={fresh.has(m.login)} rose={!!risen[m.login]} onFire={hot.has(m.login)} gap={rankGap(ranked, stats, rank)}/>;
  return <section className="as-select">
    <div className="as-select-head"><h1>The Standings</h1><span>TOP 3 HOLD · THE CREW ROTATES</span></div>
    <div className="as-cards">
      {top.length === 0 ? <div className="as-empty">THE ARENA IS QUIET</div> : top.map((m, i) => card(m, i))}
      {shown.length > 0 && <div className="as-rotation-slot">
        <AnimatePresence mode="sync" initial={false}><motion.div key={shown.map(x => x.member.login).join('|')} className="as-rotation-pair" initial={{ opacity: 0, y: reduced ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -16 }} transition={{ duration: reduced ? .1 : .45 }}>
          {shown.map(({member, rank}) => card(member, rank))}
        </motion.div></AnimatePresence>
      </div>}
    </div>
  </section>;
}

function LockInBar({ goal, progress, complete, goals, index }: { goal: { label: string; target: number }; progress: number; complete: boolean; goals: number; index: number }) {
  const pct = complete ? 100 : Math.min(100, Math.round(progress / Math.max(1, goal.target) * 100));
  return <div className={`as-lockin ${complete ? 'is-complete' : ''}`}>
    <div className="as-lockin-button"><motion.span className="as-lockin-fill" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: 'easeOut' }}/><strong>{complete ? 'LOCKED IN' : 'LOCK IN'}</strong><em>{complete ? 'EVERY TEAM GOAL CLEARED' : `${goal.label} · ${number(progress)} / ${number(goal.target)}`}</em><b>{pct}%</b></div>
    <div className="as-checks" aria-label={`${Math.min(index, goals)} of ${goals} team goals complete`}>{Array.from({ length: goals }, (_, i) => <span key={i} className={i < index ? 'done' : i === index ? 'current' : ''}>{i < index && <ArenaIcon name="check" size={13}/>}</span>)}<small>TEAM GOALS</small></div>
  </div>;
}

function ArenaMoment({ overlay, onDone }: { overlay: { type: string; payload: Record<string, unknown> }; onDone: () => void }) {
  useEffect(() => { const id = setTimeout(onDone, overlay.type === 'boss-victory' ? 5500 : 3800); return () => clearTimeout(id); }, [overlay, onDone]);
  const type = overlay.type, login = String(overlay.payload.login || 'THE TEAM');
  const tier = type === 'tier-up' ? overlay.payload.tier as 'radiant' | 'immortal' | 'ascendant' | undefined : undefined;
  const title = type === 'spike-planted' ? 'SPIKE PLANTED' : type === 'spike-defused' ? 'DEFUSED' : tier ? tier.toUpperCase() : type === 'first-blood' ? 'FIRST BLOOD' : type === 'ace' ? 'ACE' : type === 'level-up' ? 'LEVEL UP' : type === 'boss-victory' ? 'LOCKED IN' : type === 'overtaken' ? 'RANK UP' : 'UNLOCKED';
  const detail = type === 'spike-planted' ? `${overlay.payload.repo} / ${overlay.payload.branch} · ${overlay.payload.workflow}`.toUpperCase() : type === 'spike-defused' ? `${overlay.payload.repo} / ${overlay.payload.branch} · BUILD IS GREEN`.toUpperCase() : tier ? 'PROMOTED · TOP 3 THIS MONTH' : type === 'first-blood' ? 'FIRST SCORED PLAY OF THE DAY' : type === 'ace' ? 'FIVE SCORED PLAYS IN 15 MINUTES' : type === 'level-up' ? `LEVEL ${overlay.payload.level} · LIFETIME XP` : type === 'boss-victory' ? 'EVERY MONTHLY GOAL CLEARED' : type === 'overtaken' ? `NOW RANKED #${overlay.payload.newRank}` : String(getBadgeDef(String(overlay.payload.badgeId))?.name || 'NEW AWARD').toUpperCase();
  return <motion.div className={`as-moment as-moment--${tier || type}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.div className="as-moment-band" initial={{ x: '-110%', skewX: -12 }} animate={{ x: 0, skewX: -12 }} exit={{ x: '110%', skewX: -12 }} transition={{ type: 'spring', stiffness: 120, damping: 20 }}>
      <div className="as-moment-inner">{tier && <div className="as-moment-emblem"><RankEmblem tier={tier} size={110}/></div>}<span>{type === 'boss-victory' ? 'TEAM VICTORY' : login}</span><h2>{title}</h2><small>{detail}</small></div>
    </motion.div>
  </motion.div>;
}

export function ArenaSelectView({ now, hot, soundOn, onSound, uiMode, onUiMode }: { now: number; hot: Set<string>; soundOn: boolean; onSound: () => void; uiMode: UiMode; onUiMode: (mode: UiMode) => void }) {
  const members = useStore(s => s.members), stats = useStore(s => s.stats), feed = useStore(s => s.feed), bossProgress = useStore(s => s.bossProgress), bossIndex = useStore(s => s.bossIndex), bossGoals = useStore(s => s.bossGoals), isDemo = useStore(s => s.isDemo), periodStart = useStore(s => s.monthStartDate), overlay = useStore(s => s.overlayQueue[0]), popOverlay = useStore(s => s.popOverlay);
  const settings = useDisplaySettings(s => s.preferences);
  const ranked = useMemo(() => rankBy(members, stats), [members, stats]);
  const fresh = useMemo(() => new Set(feed.filter(item => now - Date.parse(item.time) >= 0 && now - Date.parse(item.time) < 12000).map(item => item.user)), [feed, now]);
  const complete = bossGoals.length > 0 && bossIndex >= bossGoals.length;
  const goal = complete ? { label: 'ALL GOALS COMPLETE', metric: 'complete', target: 1 } : bossGoals[bossIndex] || { label: 'NO OBJECTIVE SET', metric: 'none', target: 1 };
  return <div className="theme-arena arena-voyage-layout">
    <TopBar now={now} periodStart={periodStart} isDemo={isDemo} memberCount={members.length} soundOn={soundOn} onSound={onSound} uiMode={uiMode} onUiMode={onUiMode}/>
    <aside className="as-rail"><PartyFeed feed={feed} members={members} now={now}/></aside>
    <main className="as-main"><AgentCards ranked={ranked} stats={stats} hot={hot} fresh={fresh}/><LockInBar goal={{...goal, label: settings.goalLabels[goalDisplayKey(goal)] || goal.label}} progress={complete ? 1 : bossProgress[goal.metric] || 0} complete={complete} goals={bossGoals.length} index={bossIndex}/></main>
    {settings.scene === 'city' ? <LivingCity now={now}/> : <SpaceJourney now={now}/>}
    <AnimatePresence>{overlay && <ArenaMoment key={`${overlay.type}-${JSON.stringify(overlay.payload)}`} overlay={overlay} onDone={popOverlay}/>}</AnimatePresence>
  </div>;
}
