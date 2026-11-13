(() => {
  const view = document.getElementById('view');
  const fill = () => view.querySelectorAll('input[type=range]').forEach((r) => {
    const min = parseFloat(r.min) || 0, max = parseFloat(r.max) || 100;
    r.style.setProperty('--p', Math.max(0, Math.min(100, ((parseFloat(r.value) - min) / (max - min)) * 100)) + '%');
  });
  new MutationObserver(fill).observe(view, { childList: true, subtree: true });
  ['input', 'change'].forEach((ev) => document.addEventListener(ev, fill));
})();
