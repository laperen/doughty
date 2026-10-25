// Session-only group chat. Player text is rendered literally and never localized.
export function createHuntChat({ send, releaseControls, resumeCamera }) {
  const root = document.createElement('section');
  root.className = 'hunt-chat collapsed'; root.hidden = true;
  root.innerHTML = '<div class="hunt-chat-history" role="log" aria-label="Group chat" aria-live="polite" data-narrative-direct></div><input class="hunt-chat-input" aria-label="Chat message" placeholder="Message your group" maxlength="500" autocomplete="off"><div class="hunt-chat-latest" data-narrative-direct></div>';
  document.querySelector('.app-shell').append(root);
  const history = root.querySelector('.hunt-chat-history'), input = root.querySelector('input'), latest = root.querySelector('.hunt-chat-latest');
  let timer, enabled = false, escapeHeld = false;
  const touch = () => {
    root.classList.remove('collapsed'); clearTimeout(timer);
    timer = setTimeout(() => { input.blur(); root.classList.add('collapsed'); }, 10000);
  };
  const close = () => { input.blur(); touch(); resumeCamera(); };
  // Consume the entire Escape press, including repeats after the input blurs.
  // Restore pointer lock on release so the same press cannot unlock it again.
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || (!escapeHeld && document.activeElement !== input)) return;
    if (event.isComposing || event.keyCode === 229) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!escapeHeld) { escapeHeld = true; input.blur(); touch(); }
  }, true);
  window.addEventListener('keyup', event => {
    if (event.key !== 'Escape' || !escapeHeld) return;
    event.preventDefault(); event.stopImmediatePropagation();
    escapeHeld = false; resumeCamera();
  }, true);
  root.addEventListener('pointerdown', touch);
  root.addEventListener('pointermove', touch);
  root.addEventListener('wheel', touch);
  input.addEventListener('input', touch);
  input.addEventListener('focus', () => { releaseControls(); touch(); });
  input.addEventListener('keydown', event => {
    event.stopPropagation(); touch();
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter') {
      event.preventDefault(); if (event.repeat) return;
      const text = input.value.trim();
      if (!text || send(text)) { input.value = ''; close(); }
    }
  });
  input.addEventListener('keyup', event => event.stopPropagation());
  return {
    get focused() { return document.activeElement === input; },
    open() { if (!enabled) return false; releaseControls(); touch(); input.focus(); return true; },
    setRoom(active) { enabled = active; root.hidden = !active; if (!active) { input.blur(); input.value = ''; history.replaceChildren(); latest.replaceChildren(); clearTimeout(timer); root.classList.add('collapsed'); } },
    receive({ sender, text }) {
      const line = document.createElement('div'); line.className = 'hunt-chat-line';
      const name = document.createElement('strong'); name.textContent = sender + ': ';
      line.append(name, document.createTextNode(text)); history.append(line);
      while (history.children.length > 100) history.firstChild.remove();
      latest.replaceChildren(line.cloneNode(true)); history.scrollTop = history.scrollHeight;
    },
  };
}
