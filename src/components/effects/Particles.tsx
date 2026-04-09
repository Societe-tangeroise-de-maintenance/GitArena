const PARTICLES = Array.from({ length: 25 }, (_, i) => ({
  id: i,
  left: `${Math.random() * 100}%`,
  size: 2 + Math.random() * 3,
  delay: `${Math.random() * 20}s`,
  duration: `${18 + Math.random() * 14}s`,
  opacity: 0.08 + Math.random() * 0.12,
}));

export function Particles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
      {PARTICLES.map((p) => (
        <div
          key={p.id}
          className="particle absolute rounded-full bg-neonCyan"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}
    </div>
  );
}
