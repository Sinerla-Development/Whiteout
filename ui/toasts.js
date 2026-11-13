(function () {
  const DURATION = 10000;
  const MAX = 4;
  let box = null;
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function host() {
    if (box && box.isConnected) return box;
    box = document.createElement('div');
    box.id = 'toasts';
    box.className = 'toasts';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Notifications');
    box.setAttribute('popover', 'manual');
    document.body.appendChild(box);
    return box;
  }

  function lift(wrap) {
    if (!wrap.showPopover) return;
    try {
      if (wrap.matches(':popover-open')) { if (!document.querySelector('dialog[open]')) return; wrap.hidePopover(); }
      wrap.showPopover();
    } catch (e) { }
  }

  function dismiss(el) {
    if (!el || el.dataset.gone) return;
    el.dataset.gone = '1';
    if (el._anim) el._anim.cancel();
    if (reduce() || !el.animate) { el.remove(); return; }
    const out = el.animate(
      [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(.5rem) scale(.97)' }],
      { duration: 180, easing: 'ease-in', fill: 'forwards' }
    );
    out.onfinish = () => el.remove();
  }

  function show(msg, kind) {
    const wrap = host();
    const text = String(msg == null ? '' : msg);
    const type = kind === 'err' ? 'err' : kind === 'warn' ? 'warn' : 'ok';

    for (const old of [...wrap.children]) {
      if (old.dataset.msg === text && old.dataset.type === type && !old.dataset.gone) dismiss(old);
    }
    while (wrap.children.length >= MAX) dismiss(wrap.firstElementChild) || wrap.firstElementChild.remove();

    const el = document.createElement('div');
    el.className = 'toast-item ' + type;
    el.dataset.msg = text;
    el.dataset.type = type;
    el.setAttribute('role', type === 'ok' ? 'status' : 'alert');
    el.tabIndex = 0;

    const ico = document.createElement('span');
    ico.className = 'toast-ico';
    ico.setAttribute('aria-hidden', 'true');
    ico.textContent = type === 'ok' ? '✓' : '!';

    const body = document.createElement('span');
    body.className = 'toast-text';
    body.textContent = text;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-x';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '×';
    close.addEventListener('click', (e) => { e.stopPropagation(); dismiss(el); });

    const bar = document.createElement('span');
    bar.className = 'toast-bar';
    bar.setAttribute('aria-hidden', 'true');

    el.append(ico, body, close, bar);
    el.addEventListener('click', () => dismiss(el));
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); dismiss(el); } });
    wrap.appendChild(el);
    lift(wrap);

    if (el.animate) {
      if (!reduce()) {
        el.animate(
          [{ opacity: 0, transform: 'translateY(.75rem) scale(.96)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }],
          { duration: 280, easing: 'cubic-bezier(.3,.7,.3,1)' }
        );
      }
      const anim = bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: DURATION, easing: 'linear', fill: 'forwards' });
      anim.onfinish = () => dismiss(el);
      el._anim = anim;
      const hold = () => anim.pause();
      const go = () => { if (!el.matches(':hover') && !el.contains(document.activeElement)) anim.play(); };
      el.addEventListener('mouseenter', hold);
      el.addEventListener('mouseleave', go);
      el.addEventListener('focusin', hold);
      el.addEventListener('focusout', () => setTimeout(go, 0));
    } else {
      setTimeout(() => dismiss(el), DURATION);
    }
    return el;
  }

  window.toast = show;
  window.tldToasts = { show, DURATION, clear() { if (box) [...box.children].forEach((c) => c.remove()); } };
})();
