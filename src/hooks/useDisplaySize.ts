import { useEffect, useState } from 'react';

export function useDisplaySize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}

export const benchCapacity = (width: number) => width <= 600 ? 2 : width <= 1050 ? 3 : 5;
export const scoreboardCapacity = (width: number, height: number) => Math.max(3, Math.floor((height - (width < 1051 ? 125 : 160)) / (width < 1051 ? 42 : 48)));
