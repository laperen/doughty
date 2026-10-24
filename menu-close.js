/** Keep the visible close glyph separate from its localized accessible name. */
export function configureMenuClose(button, enabled = true, fallback = 'Back') {
  button.classList.toggle('npc-menu-close', enabled);
  button.removeAttribute('data-text-id');
  if (enabled) {
    button.setAttribute('aria-label', 'Close');
    button.innerHTML = '<span aria-hidden="true">×</span>';
  } else {
    button.removeAttribute('aria-label');
    button.textContent = fallback;
  }
}
