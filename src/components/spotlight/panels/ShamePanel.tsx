import { useStore } from '../../../store/useStore';

export function ShamePanel() {
  const shamePRs = useStore((s) => s.shamePRs);

  if (shamePRs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full gap-2">
        <span className="text-[20px]">✅</span>
        <span className="font-mono text-[12px] text-green">all PRs reviewed!</span>
      </div>
    );
  }

  return (
    <div className="flex items-center h-full px-8 gap-4 overflow-x-auto">
      <div className="shrink-0 flex flex-col items-center gap-1">
        <span className="text-[20px]">🚨</span>
        <span className="font-mono text-[10px] text-red uppercase tracking-wider font-medium">
          needs review
        </span>
      </div>
      <div className="flex gap-3">
        {shamePRs.slice(0, 5).map((pr, i) => (
          <div
            key={i}
            className="bg-raised border border-red/20 rounded-[6px] p-3 min-w-[200px] max-w-[240px] glow-red shame-card"
          >
            <div className="h-[2px] gradient-bar-boss rounded-full mb-2" />
            <div className="text-[12px] text-t1 truncate font-medium">{pr.title}</div>
            <div className="font-mono text-[10px] text-t3 mt-1 bg-muted rounded px-1.5 py-[1px] inline-block">{pr.repo}</div>
            <div className="flex justify-between mt-1.5">
              <span className="font-mono text-[10px] text-t3">{pr.author}</span>
              <span className="font-mono text-[10px] text-red font-medium">⏰ {pr.age}h</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
