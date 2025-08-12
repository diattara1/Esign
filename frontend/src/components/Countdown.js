// src/components/Countdown.js
import React, { useEffect, useState } from 'react';

function fmt(ms) {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}j ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m`;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export default function Countdown({ targetIso, onExpire, className = '' }) {
  const [remain, setRemain] = useState(() => {
    const t = new Date(targetIso).getTime();
    return t - Date.now();
  });

  useEffect(() => {
    const id = setInterval(() => {
      const t = new Date(targetIso).getTime();
      const diff = t - Date.now();
      setRemain(diff);
      if (diff <= 0) {
        clearInterval(id);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [targetIso, onExpire]);

  if (!targetIso) return null;
  const expired = remain <= 0;

  return (
    <div className={className}>
      {expired ? (
        <span className="text-red-600 font-medium">Échéance dépassée</span>
      ) : (
        <span className="text-gray-700">Échéance dans {fmt(remain)}</span>
      )}
    </div>
  );
}
