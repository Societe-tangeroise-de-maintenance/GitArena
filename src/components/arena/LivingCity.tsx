import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../../store/useStore';
import { useDisplaySettings } from '../../store/useDisplaySettings';
import { useDisplaySize } from '../../hooks/useDisplaySize';
import { ArenaIcon } from '../ui/ArenaIcon';
import { voyageState } from './voyage';
import './city.css';
import { SharedCompanion } from '../companion/SharedCompanion';
import { useCompanion } from '../companion/useCompanion';

const hash = (name: string) => [...name].reduce((n, char) => (n * 31 + char.charCodeAt(0)) >>> 0, 0);
export function LivingCity({ now }: { now: number }) {
  const feed = useStore(s => s.feed), alerts = useStore(s => s.ciAlerts), goals = useStore(s => s.bossGoals), progress = useStore(s => s.bossProgress), demo = useStore(s => s.isDemo);
  const settings = useDisplaySettings(s => s.preferences);
  const moment = useCompanion(s => s.moment);
  const { width } = useDisplaySize();
  const capacity = width <= 600 ? 2 : 4;
  const frameTime = Math.max(now, Date.now());
  const repos = useMemo(() => [...new Set([...alerts.map(a => a.repo), ...(moment?.repo ? [moment.repo] : []), ...feed.map(f => f.repo)].filter(Boolean))], [feed, alerts, moment?.repo]);
  const repoOrder = [...repos].sort().join('|');
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(repos.length / capacity));
  useEffect(() => { setPage(0); if (pages <= 1) return; const t = setInterval(() => setPage(p => (p + 1) % pages), 10000); return () => clearInterval(t); }, [pages, repoOrder]);
  const targetIndex = moment ? repos.indexOf(moment.repo) : -1;
  const current = targetIndex >= 0 ? Math.floor(targetIndex / capacity) : page % pages;
  const shown = repos.slice(current * capacity, (current + 1) * capacity);
  const mission = voyageState(goals, progress);
  const broken = new Set(alerts.map(a => a.repo));
  const active = repos.filter(repo => feed.some(f => f.repo === repo && frameTime - Date.parse(f.time) >= 0 && frameTime - Date.parse(f.time) < 3600000)).length;
  const hero = feed.find(f => f.repo);
  return <section className="living-city" aria-label={`Living city, ${repos.length} recently active repositories`}>
    <div className="city-scene"><div className="city-moon"/><div className="city-stars"/>
      <div className="city-overline"><span>THE BUILD DISTRICT</span><small>{pages > 1 ? `DISTRICT ${current + 1} / ${pages}` : 'LIVE SKYLINE'}</small></div>
      <div className="city-skyline" style={{gridTemplateColumns:`repeat(${capacity},minmax(0,1fr))`}}>
        {shown.map(repo => {
          const events = feed.filter(f => f.repo === repo), recent = events.some(f => frameTime - Date.parse(f.time) >= 0 && frameTime - Date.parse(f.time) < 14000);
          const merged = events.filter(f => f.type === 'pr-merged').length;
          const floors = Math.min(5, 2 + merged);
          const damaged = broken.has(repo), seed = hash(repo);
          return <div key={repo} className={`city-lot ${damaged ? 'city-lot-broken' : moment?.action === 'repair' && moment.repo === repo ? 'city-lot-repaired' : recent ? 'city-lot-active' : ''}`}>
            <div className="city-building" style={{'--tower-height':`${Math.min(74, 42 + merged * 7 + seed % 12)}%`,'--tower-tone':`${235 + seed % 35}`} as CSSProperties}>
              <span className="city-antenna"/><span className="city-roof"/>
              <div className="city-windows" style={{gridTemplateRows:`repeat(${floors},minmax(0,1fr))`}}>{Array.from({length:floors * 4},(_,i)=><i key={i} className={(seed + i * 7) % 5 < Math.min(4, events.length) ? 'lit' : ''}/>)}</div>
              <span className="city-door"/>{damaged && <span className="city-fault"><ArenaIcon name="alert" size={13}/></span>}
            </div>
            <div className="city-building-label"><strong title={repo}>{repo}</strong><span>{damaged ? 'CI NEEDS ATTENTION' : moment?.action === 'repair' && moment.repo === repo ? 'BUILD RESTORED' : recent ? 'BUILDING NOW' : `${events.length} RECENT PLAYS`}</span></div>
          </div>;
        })}
        {!repos.length && <div className="city-empty">The first project will light up the city.</div>}
      </div>
      <div className="city-street"><i/><i/><i/></div>
      <SharedCompanion world="city" targetPercent={targetIndex >= 0 ? ((targetIndex % capacity) + .5) / capacity * 100 : 50}/>
    </div>
    <div className="city-readout"><div className="space-heading"><span className="space-kicker">{settings.missionName}</span>{demo && <b className="space-demo">SIMULATION</b>}</div><h2>{settings.destinationName}</h2>
      <div className="city-counters"><div><strong>{repos.length}</strong><span>RECENT PROJECTS</span></div><div><strong>{active}</strong><span>ACTIVE THIS HOUR</span></div><div className={broken.size ? 'city-alert-count' : ''}><strong>{broken.size}</strong><span>CI ALERTS</span></div></div>
      <div className="space-route"><i style={{width:`${mission.percent}%`}}/></div><p>Team goal progress <b>{Math.floor(mission.percent)}%</b></p>
    </div>
    <aside className="city-report"><span className="space-kicker">CITY PULSE</span><h3>{broken.size ? 'Keep the lights on.' : active ? 'The district is awake.' : 'A quiet moment.'}</h3><p>{broken.size ? `${[...broken].slice(0, 2).join(', ')} ${broken.size === 1 ? 'needs' : 'need'} a green build.` : 'Recent work lights the windows. Merges grow the skyline.'}</p>{hero && <div className="city-latest"><ArenaIcon name="bolt" size={18}/><div><strong>{hero.repo}</strong><span>{hero.message} · {hero.user}</span></div></div>}<small>Based on recent activity and CI status.</small></aside>
  </section>;
}
