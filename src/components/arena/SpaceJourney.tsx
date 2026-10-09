import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { ArenaIcon } from '../ui/ArenaIcon';
import { SharedCompanion } from '../companion/SharedCompanion';
import { Avatar } from '../shared';
import { ENCOUNTERS, voyageState } from './voyage';
import './space.css';
import { useDisplaySettings } from '../../store/useDisplaySettings';

function Drone({ second = false }: { second?: boolean }) {
  return <svg className={`space-drone ${second ? 'space-drone-second' : ''}`} viewBox="0 0 60 40"><path d="M7 10h12l6 10-6 10H7l6-10ZM53 10H41l-6 10 6 10h12l-6-10Z" fill="#44388b" stroke="#a99bff"/><path d="m30 8 12 12-12 12-12-12Z" fill="#c8f9f6"/><circle cx="30" cy="20" r="5" fill="#6c5cf0"/></svg>;
}

export function SpaceJourney({ now }: { now: number }) {
  const settings = useDisplaySettings(s => s.preferences);
  const goals = useStore(s => s.bossGoals), progress = useStore(s => s.bossProgress);
  const alerts = useStore(s => s.ciAlerts), feed = useStore(s => s.feed), month = useStore(s => s.monthStartDate);
  const demo = useStore(s => s.isDemo), members = useStore(s => s.members);
  const crew = feed.filter((item, index) => feed.findIndex(other => other.user === item.user) === index).slice(0, 3);
  const voyage = voyageState(goals, progress);
  const { encounter, health, defeated, arrived } = voyage;
  const pct = Math.floor(voyage.percent + 1e-8);
  const id = useId().replace(/:/g, '');
  const last = feed[0];
  const age = last ? Math.max(now, Date.now()) - Date.parse(last.time) : Infinity;
  const recent = age >= 0 && age < 14000;
  const review = recent && last.type === 'review';
  const boosting = recent && ['commit', 'branch-push', 'pr-merged'].includes(last.type);
  const damaged = alerts.length > 0;
  const previous = useRef<{month: string; defeated: number; arrived: boolean; damaged: boolean; percent: number} | null>(null);
  const [moment, setMoment] = useState('');
  const [repairing, setRepairing] = useState(false);
  useEffect(() => {
    const before = previous.current;
    previous.current = {month, defeated, arrived, damaged, percent: voyage.percent};
    if (!before || before.month !== month || voyage.percent < before.percent) { setMoment(''); setRepairing(false); return; }
    if (arrived && !before.arrived) setMoment('DESTINATION REACHED');
    else if (defeated > before.defeated) setMoment('HOSTILE DEFEATED');
    if (before.damaged && !damaged) setRepairing(true);
  }, [month, defeated, arrived, damaged, voyage.percent]);
  useEffect(() => { if (!moment) return; const t = setTimeout(() => setMoment(''), 5000); return () => clearTimeout(t); }, [moment]);
  useEffect(() => { if (!repairing) return; const t = setTimeout(() => setRepairing(false), 7000); return () => clearTimeout(t); }, [repairing]);
  const status = damaged ? 'SYSTEM FAULT' : repairing ? 'REPAIRS COMPLETE' : review ? 'SHIELDS CHARGING' : boosting ? 'ENGINE BOOST' : arrived ? 'STABLE ORBIT' : encounter ? 'ENGAGING HOSTILE' : 'CRUISING';
  return <section className={`space-journey ${boosting ? 'space-boost' : ''} ${damaged ? 'space-damage' : ''} ${review || repairing ? 'space-support' : ''} ${encounter ? 'space-combat' : ''}`} aria-label={`Team voyage ${pct}% complete`}>
    <div className="space-scene" aria-hidden="true">
      <div className="space-nebula"/><div className="space-stars"/><div className="space-planet"><i/><i/><i/></div>
      <div className="space-coordinates">SECTOR {String(defeated + 1).padStart(2, '0')}<span>{encounter?.sector || (arrived ? settings.destinationName : 'Deep space')}</span></div>
      <svg className="space-ship" viewBox="0 0 320 180">
        <defs>
          <linearGradient id={`${id}-hull`} x2="0.9" y2="1"><stop stopColor="#ebe8ff"/><stop offset=".45" stopColor="#9285ce"/><stop offset="1" stopColor="#382d69"/></linearGradient>
          <linearGradient id={`${id}-engine`}><stop stopColor="#8df5f1" stopOpacity="0"/><stop offset=".7" stopColor="#9a8fff"/><stop offset="1" stopColor="#fff"/></linearGradient>
        </defs>
        <path className="space-engine" d="M92 64 4 78l88 14Z" fill={`url(#${id}-engine)`}/>
        <path className="space-engine space-engine-lower" d="M92 94 4 108l88 14Z" fill={`url(#${id}-engine)`}/>
        <path d="m82 73 34-51 61 30 43 26 68 12-68 12-43 26-61 30-34-51 26-17Z" fill={`url(#${id}-hull)`} stroke="#c7bcff" strokeWidth="1.5"/>
        <path d="m116 22 27 49 34-19ZM116 158l27-49 34 19Z" fill="#51437f" stroke="#8a7bb2"/>
        <path d="m120 77 93 13-93 13 16-13Z" fill="#252238" stroke="#a99bdf"/>
        <path d="m205 79 45 11-45 11 10-11Z" fill="#8df5f1"/>
        <path d="M98 59h22M98 121h22" stroke="#8df5f1" strokeWidth="4"/>
        <path d="m147 51 18 12m-18 66 18-12M159 80h24M159 100h24" stroke="#bfb3ec" strokeWidth="2"/>
        <path d="M86 71v15M86 95v15" stroke="#fff" strokeWidth="4"/>
        <ellipse className="space-shield" cx="178" cy="90" rx="130" ry="77" fill="none" stroke="#8df5f1" strokeWidth="1.5" strokeDasharray="6 4"/>
      </svg>
      {(review || repairing) && <><Drone/><Drone second/><div className="space-repair-beam"/></>}
      {encounter && <><svg className="space-hostile" viewBox="0 0 120 140">
        <path d="m60 8 20 29 31-17-7 44 11 34-29-6-26 40-26-40-29 6 11-34-7-44 31 17Z" fill="#34182f" stroke="#ff6480" strokeWidth="2"/>
        <path d="m60 27 23 41-23 43-23-43Z" fill="#722943" stroke="#ffa6b8"/>
        <path d="M40 61 55 69m25-8-15 8" stroke="#ffc1ce" strokeWidth="4"/><path d="m52 86 8 10 8-10" fill="none" stroke="#ff6480" strokeWidth="3"/>
      </svg><div className="space-laser"/><div className="space-hit"/></>}
      {damaged && <><span className="space-spark space-spark-a"/><span className="space-spark space-spark-b"/></>}
      {settings.companionEnabled && <div className="ship-station-labels" aria-hidden="true"><span>ENGINE BAY</span><span>REPAIR BAY</span><span>FLIGHT DECK</span></div>}
      <SharedCompanion world="spaceship" targetPercent={58}/>
      <div className="space-scene-footer"><span><i/>{status}</span><b>GA–01 / ODYSSEY</b></div>
      {moment && <div className="space-victory"><ArenaIcon name={arrived ? 'star' : 'shield'} size={28}/><strong>{moment}</strong><span>{arrived ? 'A new world, built together.' : 'The crew pushed through.'}</span></div>}
    </div>
    <div className="space-readout">
      <div className="space-heading"><span className="space-kicker">{settings.missionName} / {month.slice(0, 7)}</span>{demo && <b className="space-demo">SIMULATION</b>}</div>
      <h2>{arrived ? 'Orbit achieved' : encounter?.name || settings.destinationName}</h2>
      <div className="space-status"><strong>{pct}<small>%</small></strong><span>{encounter ? 'BOSS ENCOUNTER' : `${defeated} / 3 HOSTILES CLEARED`}</span></div>
      <div className="space-route"><i style={{width: `${voyage.percent}%`}}/>{ENCOUNTERS.map(e => <b key={e.start} className={pct >= e.end ? 'cleared' : pct >= e.start ? 'active' : ''} style={{left: `${e.start}%`}}/>)}</div>
      {encounter ? <div className="space-boss-status"><span>HOSTILE HULL</span><div className="space-health"><i style={{width: `${health}%`}}/></div><b>{health}%</b></div> : <div className="space-next">{arrived ? 'MONTHLY MISSION COMPLETE' : `NEXT CONTACT / ${ENCOUNTERS.find(e => e.start > pct)?.start || 100}%`}</div>}
      <p>{!voyage.configured ? 'Awaiting team objectives.' : damaged ? `CI needs attention in ${alerts[0].repo}.` : repairing ? 'Build restored. Repair drones returning.' : review ? 'Review received. Support drones deployed.' : boosting ? 'Fresh activity. Engines burning.' : 'Team objectives power our flight.'}</p>
    </div>
    <aside className="space-crew"><span className="space-kicker">RECENT CREW CONTRIBUTIONS</span>
      {crew.length ? crew.map(item => <div className="space-crew-row" key={item.id}><Avatar member={members.find(m => m.login === item.user)}/><div><strong>{members.find(m => m.login === item.user)?.name || item.user}</strong><span>{item.type === 'review' ? 'Shields reinforced' : item.type === 'pr-merged' ? 'Flight path cleared' : item.type === 'commit' || item.type === 'branch-push' ? 'Engines powered' : 'Mission support'} · {item.repo || 'Team'}</span></div><ArenaIcon name={item.type === 'review' ? 'shield' : item.type === 'pr-merged' ? 'merge' : 'bolt'} size={18}/></div>) : <p>Waiting for the crew’s first move.</p>}
    </aside>
  </section>;
}
