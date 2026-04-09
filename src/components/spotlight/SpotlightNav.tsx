const MODES = [
  { label: 'mvp', icon: '🏆' },
  { label: 'duel', icon: '⚔️' },
  { label: 'streaks', icon: '🔥' },
  { label: 'badge', icon: '🏅' },
  { label: 'fun stat', icon: '🎲' },
  { label: 'review', icon: '🚨' },
  { label: 'velocity', icon: '📈' },
  { label: 'trophies', icon: '🏆' },
];

interface Props {
  current: number;
  onSelect: (i: number) => void;
}

export function SpotlightNav({ current, onSelect }: Props) {
  return (
    <div className="w-[160px] h-full flex flex-col items-start justify-center gap-2 px-4">
      {MODES.map((mode, i) => (
        <button
          key={mode.label}
          onClick={() => onSelect(i)}
          className="flex items-center gap-2 group"
        >
          <div
            className={`transition-all duration-300 rounded-full ${
              current === i
                ? 'w-[16px] h-[6px] bg-t1'
                : 'w-[6px] h-[6px] bg-t3 group-hover:bg-t2'
            }`}
          />
          <span className={`text-[11px] ${current === i ? '' : 'opacity-60 group-hover:opacity-80'}`}>
            {mode.icon}
          </span>
          <span
            className={`font-mono text-[10px] transition-colors ${
              current === i ? 'text-t1' : 'text-t3 group-hover:text-t2'
            }`}
          >
            {mode.label}
          </span>
        </button>
      ))}
    </div>
  );
}
