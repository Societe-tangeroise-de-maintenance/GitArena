import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import type { Member } from '../types';
import { Avatar, number } from './shared';
import { ArenaIcon } from './ui/ArenaIcon';
import './history.css';

export type HistoryMode = 'day' | 'range' | 'month';
export interface HistoryQuery { mode: HistoryMode; from: string; to: string }

interface HistoryRow { login: string; xp: number; codeXp: number; prOpenedXp: number; prMergedXp: number; issueXp: number; bonusXp: number; codeChanges: number; prsOpened: number; prsMerged: number; issuesOpened: number; issuesClosed: number; reviews: number; activeDays: number }
interface HistoryEvent { login: string; kind: string; xp: number; time: string; repo: string; title: string }
interface HistoryResult {
  from: string; to: string; standings: HistoryRow[]; days: Array<{ date: string; xp: Record<string, number> }>;
  events: HistoryEvent[]; teamXp: number; issuesComplete: boolean; ledgerStart: string; beforeLedger: boolean; bonusStart: string | null;
  official: { month: string; teamXp: number; standings: Array<{ login: string; xp: number }> } | null; members: Member[];
}

// ── Date helpers (UTC, same as the TV's season clock) ──
const DAY = 86400000;
export const todayUtc = () => new Date().toISOString().slice(0, 10);
const toTime = (day: string) => Date.parse(`${day}T00:00:00Z`);
const fromTime = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => fromTime(toTime(day) + n * DAY);
export const monthStartOf = (day: string) => `${day.slice(0, 7)}-01`;
export const monthEndOf = (month: string) => { const [y, m] = month.split('-').map(Number); return fromTime(Date.UTC(y, m, 0)); };
const shiftMonth = (month: string, n: number) => { const [y, m] = month.split('-').map(Number); return fromTime(Date.UTC(y, m - 1 + n, 1)); };
const label = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en', { ...opts, timeZone: 'UTC' });
export function describeQuery(q: HistoryQuery): string {
  if (q.mode === 'month') return label(q.from, { month: 'long', year: 'numeric' });
  if (q.mode === 'day') return label(q.from, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `${label(q.from, { day: 'numeric', month: 'short', year: 'numeric' })} – ${label(q.to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
/** Move the period one step back (-1) or forward (+1), keeping its length. */
function step(q: HistoryQuery, dir: -1 | 1): HistoryQuery {
  if (q.mode === 'month') { const from = shiftMonth(q.from, dir); return { ...q, from, to: monthEndOf(from) }; }
  const len = Math.round((toTime(q.to) - toTime(q.from)) / DAY) + 1;
  return { ...q, from: addDays(q.from, dir * len), to: addDays(q.to, dir * len) };
}

// ── Store ──
interface HistoryState { query: HistoryQuery | null; open: (q: HistoryQuery) => void; close: () => void }
export const useScoreHistory = create<HistoryState>(set => ({ query: null, open: query => set({ query }), close: () => set({ query: null }) }));

async function fetchHistory(from: string, to: string, signal: AbortSignal): Promise<HistoryResult> {
  const res = await fetch(`/api/history?from=${from}&to=${to}`, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as HistoryResult;
}

const KIND_LABEL: Record<string, string> = { code: 'Code', 'pr-opened': 'PR opened', 'pr-merged': 'PR merged', 'issue-opened': 'Issue opened', 'issue-closed': 'Issue closed', review: 'Reviewed PR', branch: 'New branch', streak: 'Streak bonus' };
const KIND_ICON: Record<string, 'code' | 'branch' | 'merge' | 'issue' | 'check' | 'review' | 'git' | 'flame'> = { code: 'code', 'pr-opened': 'branch', 'pr-merged': 'merge', 'issue-opened': 'issue', 'issue-closed': 'check', review: 'review', branch: 'git', streak: 'flame' };

function ProgressChart({ result, members }: { result: HistoryResult; members: Member[] }) {
  const top = result.standings.slice(0, 6);
  const [hover, setHover] = useState<number | null>(null);
  if (!top.length || result.days.length < 2) return null;
  const series = top.map(row => { let total = 0; return { row, points: result.days.map(d => (total += d.xp[row.login] || 0)) }; });
  const max = Math.max(1, ...series.map(s => s.points[s.points.length - 1]));
  const W = 640, H = 200, PAD = 8, n = result.days.length;
  const x = (i: number) => PAD + i * (W - 2 * PAD) / (n - 1), y = (v: number) => H - PAD - v / max * (H - 2 * PAD);
  const color = (login: string) => members.find(m => m.login === login)?.color || '#9a8fff';
  const i = hover ?? n - 1;
  return <section className="history-chart" aria-label="Cumulative XP by day">
    <div className="history-section-title"><strong>Progress over the period</strong><span>Cumulative XP · {label(result.days[i].date, { day: 'numeric', month: 'short' })}</span></div>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}
      onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left) / r.width * (n - 1))))); }}>
      {[0.25, 0.5, 0.75].map(f => <line key={f} x1={PAD} x2={W - PAD} y1={y(max * f)} y2={y(max * f)} className="history-grid"/>)}
      {series.map(s => <polyline key={s.row.login} fill="none" stroke={color(s.row.login)} strokeWidth={2.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" points={s.points.map((v, k) => `${x(k)},${y(v)}`).join(' ')}/>)}
      <line x1={x(i)} x2={x(i)} y1={PAD} y2={H - PAD} className="history-cursor"/>
    </svg>
    <ul className="history-legend">{series.map(s => <li key={s.row.login}><i style={{ background: color(s.row.login) }}/>{members.find(m => m.login === s.row.login)?.name || s.row.login}<b>{number(s.points[i])}</b></li>)}</ul>
  </section>;
}

function DailyBars({ result }: { result: HistoryResult }) {
  if (result.days.length < 2) return null;
  const totals = result.days.map(d => Object.values(d.xp).reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  return <section className="history-bars" aria-label="Team XP per day">
    <div className="history-section-title"><strong>Team XP per day</strong><span>Best day {number(max)} XP</span></div>
    <div className="history-bar-row">{result.days.map((d, k) => <div key={d.date} title={`${label(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}: ${number(totals[k])} XP`}><i style={{ height: `${totals[k] ? Math.max(4, totals[k] / max * 100) : 0}%` }}/>{result.days.length <= 31 && <small>{Number(d.date.slice(8))}</small>}</div>)}</div>
  </section>;
}

function HistoryDialog({ query }: { query: HistoryQuery }) {
  const close = useScoreHistory(s => s.close), open = useScoreHistory(s => s.open);
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [monthToDate, setMonthToDate] = useState<HistoryResult | null>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError('');
    const mtdFrom = monthStartOf(query.from);
    Promise.all([
      fetchHistory(query.from, query.to, ctrl.signal),
      query.mode === 'day' && query.from !== mtdFrom ? fetchHistory(mtdFrom, query.from, ctrl.signal) : Promise.resolve(null),
    ]).then(([main, mtd]) => { setResult(main); setMonthToDate(mtd ?? (query.mode === 'day' ? main : null)); })
      .catch(err => { if (!ctrl.signal.aborted) { setError(String(err.message || err)); setResult(null); } })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [query.from, query.to, query.mode]);
  const members = result?.members || [];
  const member = (login: string): Member => members.find(m => m.login === login) || { login, name: login, color: '#9a8fff', avatarUrl: '' };
  const next = step(query, 1), canNext = next.from <= todayUtc();
  const mtdRank = useMemo(() => Object.fromEntries((monthToDate?.standings || []).map((r, k) => [r.login, { xp: r.xp, rank: k + 1 }])), [monthToDate]);
  const rows = query.mode === 'day' && monthToDate
    ? [...new Set([...(result?.standings || []).map(r => r.login), ...monthToDate.standings.map(r => r.login)])]
        .map(login => result?.standings.find(r => r.login === login) || { login, xp: 0, codeXp: 0, prOpenedXp: 0, prMergedXp: 0, issueXp: 0, bonusXp: 0, codeChanges: 0, prsOpened: 0, prsMerged: 0, issuesOpened: 0, issuesClosed: 0, reviews: 0, activeDays: 0 })
        .sort((a, b) => (mtdRank[b.login]?.xp || 0) - (mtdRank[a.login]?.xp || 0) || b.xp - a.xp)
    : result?.standings || [];
  const bonusMissing = !!result && (!result.bonusStart || result.from < result.bonusStart);
  const officialXp = Object.fromEntries((result?.official?.standings || []).map(s => [s.login, s.xp]));

  return <dialog ref={dialog} className="display-settings score-history" aria-labelledby="history-title" onCancel={close}>
    <div className="history-body">
      <header><div><span className="settings-kicker">SCORE HISTORY · {query.mode === 'day' ? 'ONE DAY' : query.mode === 'month' ? 'FULL MONTH' : 'DATE RANGE'}</span><h2 id="history-title">{describeQuery(query)}</h2>
        <p>{query.mode === 'day' ? 'XP earned that day, and each builder’s month total up to the end of that day.' : 'XP recalculated from every scored contribution in this period.'}</p></div>
        <div className="history-nav"><button type="button" onClick={() => open(step(query, -1))} aria-label="Previous period"><ArenaIcon name="arrow" size={17}/></button><button type="button" disabled={!canNext} onClick={() => canNext && open(next)} aria-label="Next period"><ArenaIcon name="arrow" size={17}/></button><button type="button" className="settings-close" aria-label="Close score history" onClick={close}><ArenaIcon name="close" size={20}/></button></div>
      </header>
      {loading && <div className="history-status">Calculating scores…</div>}
      {error && <div className="history-status history-status--error">{error}</div>}
      {result && !loading && <>
        <div className="history-summary">
          <div><span>Team XP</span><strong>{number(result.teamXp)}</strong></div>
          <div><span>Builders scoring</span><strong>{result.standings.filter(r => r.xp > 0).length}</strong></div>
          {query.mode === 'day' && monthToDate && <div><span>Month to date</span><strong>{number(monthToDate.teamXp)}</strong></div>}
          {result.official && <div><span>Final on TV</span><strong>{number(result.official.teamXp)}</strong></div>}
        </div>
        {(result.beforeLedger || !result.issuesComplete || bonusMissing) && <ul className="history-notes">
          {result.beforeLedger && <li>Itemised scores start on {label(result.ledgerStart, { day: 'numeric', month: 'long', year: 'numeric' })}; earlier code and PR XP is not available.</li>}
          {bonusMissing && <li>Review, new-branch and streak bonuses are recorded {result.bonusStart ? `from ${label(result.bonusStart, { day: 'numeric', month: 'long', year: 'numeric' })}` : 'from the next update'} onwards, so this period does not include them{result.official ? ' — that is why “Final on TV” is higher' : ''}.</li>}
          {!result.issuesComplete && <li>GitHub did not return every issue (rate limit). Issue XP may be low — try again in a few minutes.</li>}
        </ul>}
        {rows.length === 0 ? <div className="history-status">No scored activity in this period.</div> :
        <div className="history-table-wrap"><table className="history-table">
          <thead><tr><th>#</th><th>Builder</th><th className="num">{query.mode === 'day' ? 'Day XP' : 'XP'}</th>{query.mode === 'day' && <th className="num">Month to date</th>}{result.official && <th className="num">Final on TV</th>}<th className="num">Code</th><th className="num">PRs opened</th><th className="num">PRs merged</th><th className="num">Issues</th><th className="num">Reviews &amp; bonuses</th>{query.mode !== 'day' && <th className="num">Active days</th>}</tr></thead>
          <tbody>{rows.map((r, k) => <tr key={r.login}>
            <td className="rank">{String(query.mode === 'day' ? mtdRank[r.login]?.rank || k + 1 : k + 1).padStart(2, '0')}</td>
            <td><div className="history-person"><Avatar member={member(r.login)}/><span><strong>{member(r.login).name}</strong><small>@{r.login}</small></span></div></td>
            <td className="num strong">{number(r.xp)}</td>
            {query.mode === 'day' && <td className="num strong">{number(mtdRank[r.login]?.xp || 0)}</td>}
            {result.official && <td className="num">{officialXp[r.login] !== undefined ? number(officialXp[r.login]) : '—'}</td>}
            <td className="num">{number(r.codeXp)}<small>{r.codeChanges} changes</small></td>
            <td className="num">{number(r.prOpenedXp)}<small>{r.prsOpened} PRs</small></td>
            <td className="num">{number(r.prMergedXp)}<small>{r.prsMerged} PRs</small></td>
            <td className="num">{number(r.issueXp)}<small>{r.issuesOpened} opened · {r.issuesClosed} closed</small></td>
            <td className="num">{number(r.bonusXp)}<small>{r.reviews} reviews</small></td>
            {query.mode !== 'day' && <td className="num">{r.activeDays}</td>}
          </tr>)}</tbody>
        </table></div>}
        <ProgressChart result={result} members={members}/>
        <DailyBars result={result}/>
        {query.mode === 'day' && result.events.length > 0 && <section className="history-events" aria-label="Activity that day">
          <div className="history-section-title"><strong>What happened that day</strong><span>{result.events.length} scored actions</span></div>
          <ol>{result.events.map((e, k) => <li key={`${e.time}-${k}`}><time>{new Date(e.time).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })}</time><ArenaIcon name={KIND_ICON[e.kind] || 'spark'} size={16}/><span><strong>{member(e.login).name}</strong> · {KIND_LABEL[e.kind] || e.kind}<small>{e.repo} — {e.title}</small></span><b>+{number(e.xp)}</b></li>)}</ol>
        </section>}
        <p className="history-footnote">Times are UTC. Code XP for a PR is credited on the day of the author’s latest commit in it. Issues are re-counted from GitHub.</p>
      </>}
    </div>
  </dialog>;
}

export function ScoreHistory() { const query = useScoreHistory(s => s.query); return query ? <HistoryDialog key={`${query.from}|${query.to}|${query.mode}`} query={query}/> : null; }

/** The period picker shown inside Display settings. */
export function HistoryPicker({ onOpen }: { onOpen: () => void }) {
  const open = useScoreHistory(s => s.open);
  const today = todayUtc();
  const lastMonth = shiftMonth(monthStartOf(today), -1);
  const [mode, setMode] = useState<HistoryMode>('month');
  const [day, setDay] = useState(addDays(today, -1));
  const [month, setMonth] = useState(lastMonth.slice(0, 7));
  const [from, setFrom] = useState(lastMonth);
  const [to, setTo] = useState(monthEndOf(lastMonth));
  const query: HistoryQuery = mode === 'day' ? { mode, from: day, to: day }
    : mode === 'month' ? { mode, from: `${month}-01`, to: monthEndOf(`${month}-01`) }
    : { mode, from, to };
  const days = Math.round((toTime(query.to) - toTime(query.from)) / DAY) + 1;
  const invalid = !query.from || !query.to || Number.isNaN(days) ? 'Pick a date.' : query.from > query.to ? 'The start date is after the end date.' : query.from > today ? 'That date is in the future.' : days > 92 ? 'Choose 92 days or fewer.' : '';
  return <fieldset className="settings-history"><legend>Score history <small>See the standings for a past month, day or date range</small></legend>
    <div className="settings-segment" role="radiogroup" aria-label="Period type">{(['month', 'day', 'range'] as const).map(m => <label key={m} className={mode === m ? 'selected' : ''}><input type="radio" name="history-mode" value={m} checked={mode === m} onChange={() => setMode(m)}/>{m === 'month' ? 'Month' : m === 'day' ? 'Specific day' : 'Date range'}</label>)}</div>
    <div className="settings-fields">
      {mode === 'month' && <label>Month<input type="month" value={month} max={today.slice(0, 7)} onChange={e => setMonth(e.target.value)}/></label>}
      {mode === 'day' && <label>Day<input type="date" value={day} max={today} onChange={e => setDay(e.target.value)}/></label>}
      {mode === 'range' && <><label>From<input type="date" value={from} max={today} onChange={e => setFrom(e.target.value)}/></label><label>To<input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)}/></label></>}
    </div>
    <div className="settings-history-actions">
      <button type="button" className="settings-cancel" onClick={() => { open({ mode: 'month', from: lastMonth, to: monthEndOf(lastMonth) }); onOpen(); }}>Last month</button>
      <button type="button" className="settings-cancel" onClick={() => { open({ mode: 'day', from: today, to: today }); onOpen(); }}>Today</button>
      <span className="settings-history-error" role="alert">{invalid}</span>
      <button type="button" className="settings-save" disabled={!!invalid} onClick={() => { open(query); onOpen(); }}>View scores <ArenaIcon name="chart" size={16}/></button>
    </div>
  </fieldset>;
}
