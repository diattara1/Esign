export function handleKeyDown(e, onEnter, onEscape) {
  if (e.key === 'Enter') {
    e.preventDefault();
    onEnter && onEnter(e);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    onEscape && onEscape(e);
  }
}
