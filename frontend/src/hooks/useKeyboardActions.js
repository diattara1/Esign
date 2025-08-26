import { useCallback } from 'react';

export default function useKeyboardActions({ onEnter, onEsc }) {
  return useCallback(
    (e) => {
      if (e.key === 'Enter' && onEnter) {
        e.preventDefault();
        onEnter(e);
      } else if (e.key === 'Escape' && onEsc) {
        e.preventDefault();
        onEsc(e);
      }
    },
    [onEnter, onEsc]
  );
}

