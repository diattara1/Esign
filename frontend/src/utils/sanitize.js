
export default function sanitize(input) {
  if (input == null) return '';
  const div = document.createElement('div');
  div.textContent = String(input);
  return div.innerHTML;
}