(() => {
  'use strict';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function PanZoom(host, layer, size, opt) {
    opt = opt || {};
    let W = size.w, H = size.h, s = 1, tx = 0, ty = 0, fitS = 1, minS = 0.05, maxS = 4, moved = false;
    let drag = null, pinch = null;
    const ptrs = new Map();
    const watchers = opt.onChange ? [opt.onChange] : [];
    const pad = opt.pad === undefined ? 16 : opt.pad;
    const box = () => host.getBoundingClientRect();
    const ready = () => { const r = box(); return r.width > 8 && r.height > 8; };

    function limits() {
      const r = box();
      fitS = Math.min((r.width - 2 * pad) / W, (r.height - 2 * pad) / H);
      if (!(fitS > 0)) fitS = 0.1;
      minS = fitS * 0.7;
      maxS = Math.max(fitS * 10, 1.5);
    }
    function apply(animate) {
      const r = box();
      const keep = Math.min(140, r.width * 0.3, r.height * 0.3);
      tx = clamp(tx, keep - W * s, r.width - keep);
      ty = clamp(ty, keep - H * s, r.height - keep);
      const ease = 'cubic-bezier(.2,.8,.2,1)';
      layer.style.transition = animate && !reduced() ? 'transform .24s ' + ease + ', --inv .24s ' + ease : 'none';
      layer.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
      layer.style.setProperty('--inv', String(1 / s));
      const v = { s, fitS, atMin: s <= minS * 1.001, atMax: s >= maxS * 0.999 };
      watchers.forEach((fn) => fn(v));
    }
    function fit(animate) {
      if (!ready()) return;
      limits();
      const r = box();
      s = fitS; tx = (r.width - W * s) / 2; ty = (r.height - H * s) / 2; moved = false;
      apply(animate);
    }
    function zoomAt(ns, cx, cy, animate) {
      ns = clamp(ns, minS, maxS);
      const k = ns / s;
      tx = cx - (cx - tx) * k; ty = cy - (cy - ty) * k; s = ns; moved = true;
      apply(animate);
    }
    const toContent = (cx, cy) => { const r = box(); return [(cx - r.left - tx) / s, (cy - r.top - ty) / s]; };

    function onWheel(e) {
      e.preventDefault();
      if (!ready()) return;
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= 400;
      const r = box();
      zoomAt(s * Math.exp(-clamp(dy, -150, 150) * (e.ctrlKey ? 0.012 : 0.0016)), e.clientX - r.left, e.clientY - r.top, false);
    }
    function startPinch() {
      const [a, b] = Array.from(ptrs.values());
      const r = box();
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s, cx: ((a.x + b.x) / 2 - r.left - tx) / s, cy: ((a.y + b.y) / 2 - r.top - ty) / s };
      drag = null;
      host.classList.add('panning');
      ptrs.forEach((_, id) => { try { host.setPointerCapture(id); } catch (err) { } });
    }
    function onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest && e.target.closest('.zoomctl')) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) drag = { id: e.pointerId, x: e.clientX, y: e.clientY, tx, ty, active: false };
      else if (ptrs.size === 2) startPinch();
    }
    function onMove(e) {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (pinch && ptrs.size >= 2) {
        const [a, b] = Array.from(ptrs.values());
        const r = box();
        const ns = clamp(pinch.s * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), minS, maxS);
        s = ns; tx = (a.x + b.x) / 2 - r.left - pinch.cx * ns; ty = (a.y + b.y) / 2 - r.top - pinch.cy * ns; moved = true;
        apply(false);
        return;
      }
      if (drag && drag.id === e.pointerId) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.active && Math.hypot(dx, dy) > (e.pointerType === 'mouse' ? 4 : 8)) {
          drag.active = true;
          host.classList.add('panning');
          try { host.setPointerCapture(e.pointerId); } catch (err) { }
        }
        if (drag.active) { tx = drag.tx + dx; ty = drag.ty + dy; moved = true; apply(false); }
      }
    }
    function onUp(e) {
      const d = drag && drag.id === e.pointerId ? drag : null;
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (d) {
        drag = null;
        host.classList.remove('panning');
        if (!d.active && e.type === 'pointerup' && opt.onTap) opt.onTap.apply(null, toContent(e.clientX, e.clientY).concat(e));
      } else if (ptrs.size === 1 && !pinch) {
        const [id, p] = Array.from(ptrs.entries())[0];
        drag = { id, x: p.x, y: p.y, tx, ty, active: true };
      } else if (!ptrs.size) host.classList.remove('panning');
    }
    function onDbl(e) {
      if (e.target.closest && e.target.closest('button, a, input, select, .zoomctl')) return;
      const r = box();
      zoomAt(s * 2, e.clientX - r.left, e.clientY - r.top, true);
    }
    function onKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      if (t && t !== host && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      const step = e.shiftKey ? 240 : 80, r = box();
      switch (e.key) {
        case 'ArrowLeft': tx += step; moved = true; apply(false); break;
        case 'ArrowRight': tx -= step; moved = true; apply(false); break;
        case 'ArrowUp': ty += step; moved = true; apply(false); break;
        case 'ArrowDown': ty -= step; moved = true; apply(false); break;
        case '+': case '=': zoomAt(s * 1.4, r.width / 2, r.height / 2, true); break;
        case '-': case '_': zoomAt(s / 1.4, r.width / 2, r.height / 2, true); break;
        case '0': fit(true); break;
        default: return;
      }
      e.preventDefault();
    }

    host.addEventListener('wheel', onWheel, { passive: false });
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onUp);
    host.addEventListener('dblclick', onDbl);
    host.addEventListener('keydown', onKey);
    const ro = new ResizeObserver(() => { if (!ready()) return; limits(); if (moved) apply(false); else fit(false); });
    ro.observe(host);
    fit(false);

    return {
      get scale() { return s; },
      get fitScale() { return fitS; },
      centerOn(x, y, scale, animate) {
        if (!ready()) return;
        const r = box();
        s = clamp(scale || s, minS, maxS); tx = r.width / 2 - x * s; ty = r.height / 2 - y * s; moved = true;
        apply(animate !== false);
      },
      fit: (animate) => fit(animate !== false),
      zoomBy(f) { const r = box(); zoomAt(s * f, r.width / 2, r.height / 2, true); },
      setSize(w, h) { W = w; H = h; moved = false; fit(false); },
      watch(fn) { watchers.push(fn); },
      destroy() {
        ro.disconnect();
        host.removeEventListener('wheel', onWheel);
        host.removeEventListener('pointerdown', onDown);
        host.removeEventListener('pointermove', onMove);
        host.removeEventListener('pointerup', onUp);
        host.removeEventListener('pointercancel', onUp);
        host.removeEventListener('dblclick', onDbl);
        host.removeEventListener('keydown', onKey);
      },
    };
  }

  PanZoom.controls = (pz) => {
    const mk = (icon, label, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
      b.style.setProperty('--i', 'var(--ico-' + icon + ')');
      b.addEventListener('click', fn);
      return b;
    };
    const plus = mk('plus', 'Zoom in', () => pz.zoomBy(1.5));
    const minus = mk('minus', 'Zoom out', () => pz.zoomBy(1 / 1.5));
    const fit = mk('fit', 'Fit map to window', () => pz.fit());
    const wrap = document.createElement('div');
    wrap.className = 'zoomctl';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Zoom');
    wrap.append(plus, minus, fit);
    pz.watch((v) => { plus.disabled = v.atMax; minus.disabled = v.atMin; });
    return wrap;
  };

  window.PanZoom = PanZoom;
})();
