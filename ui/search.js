(function () {
  if (typeof document === 'undefined' || typeof viewRender !== 'function') return;
  const bar = document.getElementById('searchBar');
  const input = document.getElementById('tabSearch');
  const note = document.getElementById('searchNote');
  if (!bar || !input) return;
  const SKIP = new Set(['inv']);
  let lastTab = null;
  const opened = new Set();

  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const txt = (el) => norm(el.textContent + ' ' + [...el.querySelectorAll('input[type=text],input[type=search],select,[title],[aria-label]')].map((x) => (x.value || '') + ' ' + (x.title || '') + ' ' + (x.getAttribute('aria-label') || '')).join(' '));

  function reset(view) {
    view.querySelectorAll('[data-sh]').forEach((el) => { el.hidden = false; el.removeAttribute('data-sh'); });
  }

  function hide(el) { el.hidden = true; el.setAttribute('data-sh', '1'); }

  function filterBox(box, words, headText) {
    const rows = [...box.querySelectorAll(':scope > .row, :scope > .fold-body > .row, :scope > div > .row')];
    const headHit = words.every((w) => headText.includes(w));
    if (headHit) return true;
    let any = false;
    for (const r of rows) {
      if (words.every((w) => txt(r).includes(w))) any = true; else hide(r);
    }
    if (!rows.length) return words.every((w) => txt(box).includes(w));
    return any;
  }

  function apply() {
    const view = document.getElementById('view');
    if (!view) return;
    const tab = (typeof state !== 'undefined' && state.tab) || '';
    const off = SKIP.has(tab) || !(typeof state !== 'undefined' && state.outer);
    bar.hidden = off;
    if (tab !== lastTab) { lastTab = tab; if (input.value) input.value = ''; closeOpened(); }
    reset(view);
    note.textContent = '';
    const q = norm(input.value);
    if (off || !q) return;
    const words = q.split(' ');
    const folds = [...view.querySelectorAll('details.fold')];
    let pending = false;
    for (const d of folds) if (!d.open) { d.open = true; opened.add(d.dataset.fold); pending = true; }
    if (pending) { setTimeout(apply, 30); }
    let shown = 0;
    const units = [...view.children].flatMap((c) => (c.classList.contains('card') || c.tagName === 'DETAILS' ? [c] : [...c.children].filter((x) => x.classList && x.classList.contains('card'))));
    for (const u of units) {
      const head = u.querySelector('summary, h3, h2, strong');
      const ok = filterBox(u, words, head ? txt(head) : '');
      if (ok) shown++; else hide(u);
    }
    note.textContent = shown ? '' : 'Nothing matches "' + input.value.trim() + '".';
  }

  function closeOpened() {
    if (!opened.size) return;
    document.querySelectorAll('details.fold').forEach((d) => { if (opened.has(d.dataset.fold)) d.open = false; });
    opened.clear();
  }

  const base = window.viewRender;
  window.viewRender = function () { const r = base.apply(this, arguments); apply(); return r; };

  input.addEventListener('input', () => { if (!input.value) closeOpened(); apply(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; closeOpened(); apply(); input.blur(); } });
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || bar.hidden) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    e.preventDefault();
    input.focus();
    input.select();
  });
  apply();
})();
