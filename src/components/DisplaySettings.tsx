import { useEffect, useRef, useState } from 'react';
import { DEFAULT_DISPLAY, goalDisplayKey, useDisplaySettings, type DisplayPreferences } from '../store/useDisplaySettings';
import { useStore } from '../store/useStore';
import { ArenaIcon } from './ui/ArenaIcon';
import './settings.css';

export function SettingsButton({ arena = false }: { arena?: boolean }) {
  const show = useDisplaySettings(s => s.show);
  return <button className={arena ? 'as-sound settings-button' : 'icon-button settings-button'} onClick={show} aria-label="Display settings" title="Display settings"><ArenaIcon name="settings" size={20}/></button>;
}

function SettingsDialog() {
  const preferences = useDisplaySettings(s => s.preferences), close = useDisplaySettings(s => s.close), save = useDisplaySettings(s => s.save);
  const goals = useStore(s => s.bossGoals);
  const [draft, setDraft] = useState<DisplayPreferences>(() => ({...preferences, goalLabels: {...preferences.goalLabels}}));
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current, previousFocus = document.activeElement as HTMLElement | null;
    el?.showModal();
    return () => { el?.close(); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  const change = <K extends keyof DisplayPreferences>(key: K, value: DisplayPreferences[K]) => setDraft(d => ({...d, [key]: value}));
  return <dialog ref={dialog} className="display-settings" aria-labelledby="settings-title" onCancel={close} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } }}>
    <form onSubmit={event => { event.preventDefault(); save(draft); }}>
      <header><div><span className="settings-kicker">MAKE IT YOURS</span><h2 id="settings-title">Display settings</h2><p>Your choices are saved on this screen.</p></div><button type="button" className="settings-close" aria-label="Close settings" onClick={close}><ArenaIcon name="close" size={20}/></button></header>
      <fieldset className="settings-scene"><legend>Team world <small>Shown in Arena’s bottom panel</small></legend>
        {(['spaceship','city'] as const).map(scene => <label key={scene} className={`settings-world ${draft.scene === scene ? 'selected' : ''}`}><input type="radio" name="scene" value={scene} checked={draft.scene === scene} onChange={() => change('scene', scene)}/><ArenaIcon name={scene === 'city' ? 'city' : 'spark'} size={30}/><strong>{scene === 'city' ? 'Living city' : 'Spaceship'}</strong><span>{scene === 'city' ? 'Projects become a glowing skyline.' : 'The crew travels through boss encounters.'}</span><ArenaIcon name="check" size={16}/></label>)}
      </fieldset>
      <div className="settings-fields"><label>Mission name<input value={draft.missionName} maxLength={60} onChange={e => change('missionName', e.target.value)} placeholder="Team mission"/></label><label>Destination name<input value={draft.destinationName} maxLength={60} onChange={e => change('destinationName', e.target.value)} placeholder="New horizon"/></label></div>
      <fieldset className="settings-goals"><legend>Goal names <small>Rename what the TV shows</small></legend>{goals.map(goal => <label key={goalDisplayKey(goal)}><span>{goal.label}<small>{goal.target} {goal.metric === 'commits' ? 'commits' : goal.metric === 'prsMerged' ? 'merged PRs' : 'closed issues'}</small></span><input aria-label={`Display name for ${goal.label}`} maxLength={80} value={draft.goalLabels[goalDisplayKey(goal)] ?? ''} placeholder={goal.label} onChange={e => change('goalLabels', {...draft.goalLabels, [goalDisplayKey(goal)]: e.target.value})}/></label>)}</fieldset>
      <div className="settings-fields"><label>Standings rotation<select value={draft.rotationSeconds} onChange={e => change('rotationSeconds', Number(e.target.value))}><option value={6.5}>Every 6.5 seconds</option><option value={10}>Every 10 seconds</option><option value={15}>Every 15 seconds</option></select></label><label>Fullscreen moments<select value={draft.takeoverSeconds} onChange={e => change('takeoverSeconds', Number(e.target.value))}><option value={300}>Every 5 minutes</option><option value={600}>Every 10 minutes</option><option value={900}>Every 15 minutes</option></select></label></div>
      <div className="settings-fields"><label>Companion name<input value={draft.companionName} maxLength={18} placeholder="Patch" onChange={e => change('companionName', e.target.value)}/></label><label className="settings-pet-toggle"><input type="checkbox" aria-label="Show shared companion" checked={draft.companionEnabled} onChange={e => change('companionEnabled', e.target.checked)}/><span>Show the shared companion<small>Your little robot appears in both worlds.</small></span></label></div>
      <label className="settings-calm"><input type="checkbox" aria-label="Calmer motion" checked={draft.calmMotion} onChange={e => change('calmMotion', e.target.checked)}/><span>Calmer motion<small>Keep the automatic rotation, soften the animated effects.</small></span></label>
      <footer><button type="button" className="settings-reset" onClick={() => setDraft({...DEFAULT_DISPLAY, goalLabels:{}})}>Reset display</button><button type="button" className="settings-cancel" onClick={close}>Cancel</button><button type="submit" className="settings-save">Save settings <ArenaIcon name="check" size={16}/></button></footer>
    </form>
  </dialog>;
}
export function DisplaySettings() { const open = useDisplaySettings(s => s.open); return open ? <SettingsDialog/> : null; }
