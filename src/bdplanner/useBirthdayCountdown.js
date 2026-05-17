import { useEffect, useMemo, useState } from 'react';

function computeCountdown(birthDate) {
  if (!birthDate) {
    return null;
  }

  const now = new Date();
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) {
    return null;
  }

  let nextBD = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (nextBD < now) {
    nextBD = new Date(now.getFullYear() + 1, birth.getMonth(), birth.getDate());
  }

  const age = nextBD.getFullYear() - birth.getFullYear();
  const diff = nextBD - now;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return {
    age,
    days,
    weeks,
    hours,
    minutes,
    nextLabel: nextBD.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

export function useBirthdayCountdown(birthDate) {
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tick forces refresh each minute
  const countdown = useMemo(() => computeCountdown(birthDate), [birthDate, tick]);

  useEffect(() => {
    if (!birthDate) {
      return undefined;
    }
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [birthDate]);

  return { countdown };
}
