(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const menu = $('#docMenu'), btn = $('#menuBtn');
  if (menu && btn && typeof menu.showPopover === 'function') {
    const place = () => {
      const r = btn.getBoundingClientRect();
      menu.style.left = 'auto';
      menu.style.top = (r.bottom + 6) + 'px';
      menu.style.right = Math.max(8, innerWidth - r.right) + 'px';
    };
    menu.addEventListener('beforetoggle', (e) => { if (e.newState === 'open') place(); });
    menu.addEventListener('toggle', (e) => {
      btn.setAttribute('aria-expanded', String(e.newState === 'open'));
      if (e.newState === 'open') { place(); const f = menu.querySelector('button:not([hidden])'); if (f) f.focus(); }
    });
    menu.addEventListener('click', (e) => { if (e.target.closest('button')) menu.hidePopover(); });
    menu.addEventListener('keydown', (e) => {
      const items = Array.from(menu.querySelectorAll('button:not([hidden])'));
      const i = items.indexOf(document.activeElement);
      let n = -1;
      if (e.key === 'ArrowDown') n = (i + 1) % items.length;
      else if (e.key === 'ArrowUp') n = (i - 1 + items.length) % items.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = items.length - 1;
      if (n >= 0) { e.preventDefault(); items[n].focus(); }
    });
  }
})();
