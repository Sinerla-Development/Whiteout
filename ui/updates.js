(() => {
  'use strict';

  const tld = window.tld;
  const TD = window.tldDesktop;
  if (!tld || !TD) return;
  const $ = (s) => document.querySelector(s);
  const T = window.__TAURI__ || {};
  const DAY = 24 * 60 * 60 * 1000;
  const RELEASES = 'https://github.com/Sinerla-Development/Whiteout/releases';
  let ready = null, pending = null, busy = false;

  const bar = $('#updateBar'), text = $('#updateText');
  const installBtn = $('#updateInstallBtn'), laterBtn = $('#updateLaterBtn'), notesBtn = $('#updateNotesBtn');
  const status = $('#updateStatus');
  const askBar = $('#updateAskBar');
  async function answer(on) {
    askBar.hidden = true;
    try { await tld.saveSettings({ autoUpdate: on }); } catch (e) { toast('Could not save the setting: ' + TD.code(e), 'err'); return; }
    if (on) check(false);
  }
  $('#updateAskYes').addEventListener('click', () => answer(true));
  $('#updateAskNo').addEventListener('click', () => answer(false));
  const say = (t, err) => { if (!status) return; status.textContent = t || ''; status.classList.toggle('err', !!err); };

  async function isReady() {
    if (ready === null) {
      try { ready = !!(T.updater && typeof T.updater.check === 'function' && await tld.invoke('updater_ready')); } catch (e) { ready = false; }
    }
    return ready;
  }

  function show(update) {
    pending = update;
    text.textContent = 'Whiteout ' + update.version + ' is available.';
    installBtn.disabled = false;
    laterBtn.disabled = false;
    bar.hidden = false;
  }
  function hide() { bar.hidden = true; }

  async function check(manual) {
    if (busy) return null;
    if (!(await isReady())) {
      if (manual) say('Update checks are not set up in this build yet.');
      return null;
    }
    busy = true;
    if (manual) say('Checking…');
    try {
      let update = null;
      try { update = await T.updater.check(); }
      catch (e) { if (manual) say('Could not check for updates. Check your connection and try again.', true); return null; }
      try { await tld.saveSettings({ lastUpdateCheck: Date.now() }); } catch (e) { }
      if (!update) { pending = null; hide(); if (manual) say('Whiteout is up to date.'); return null; }
      show(update);
      if (manual) say('Whiteout ' + update.version + ' is available.');
      return update;
    } finally { busy = false; }
  }

  async function install() {
    if (!pending || busy) return;
    if (state && state.outer && TD.isDirty() && !(await TD.ask({ title: 'Install the update?', text: 'Whiteout restarts after the update, and unsaved changes in the open slot will be lost.', ok: 'Install and restart', danger: true }))) return;
    busy = true;
    installBtn.disabled = true;
    laterBtn.disabled = true;
    let total = 0, got = 0;
    text.textContent = 'Downloading Whiteout ' + pending.version + '…';
    try {
      await pending.downloadAndInstall((ev) => {
        if (!ev) return;
        if (ev.event === 'Started') total = (ev.data && ev.data.contentLength) || 0;
        else if (ev.event === 'Progress') {
          got += (ev.data && ev.data.chunkLength) || 0;
          if (total) text.textContent = 'Downloading Whiteout ' + pending.version + '… ' + Math.min(100, Math.round((got / total) * 100)) + ' %';
        } else if (ev.event === 'Finished') text.textContent = 'Installing Whiteout ' + pending.version + '…';
      });
      text.textContent = 'Restarting…';
      if (T.process && T.process.relaunch) await T.process.relaunch();
    } catch (e) {
      text.textContent = 'Whiteout ' + pending.version + ' is available.';
      installBtn.disabled = false;
      laterBtn.disabled = false;
      toast('The update could not be installed: ' + TD.code(e), 'err');
    } finally { busy = false; }
  }

  installBtn.addEventListener('click', install);
  laterBtn.addEventListener('click', hide);
  notesBtn.addEventListener('click', () => {
    const url = pending ? RELEASES + '/tag/v' + String(pending.version).replace(/^v/, '') : RELEASES;
    if (T.opener && T.opener.openUrl) T.opener.openUrl(url).catch(() => toast('Could not open the link', 'err'));
  });

  async function fill() {
    const s = tld.settings();
    const chk = $('#autoUpdateChk');
    chk.checked = s.autoUpdate === true;
    const ok = await isReady();
    chk.disabled = !ok;
    $('#updateCheckBtn').disabled = !ok;
    $('#updateNote').textContent = ok
      ? 'Checking for updates connects to GitHub. Everything else in Whiteout works offline.'
      : 'Update checks are not set up in this build yet. Whiteout does not connect to GitHub.';
    if (T.app && T.app.getVersion) T.app.getVersion().then((v) => { $('#updateVersion').textContent = 'Version ' + v; }).catch(() => { });
  }

  $('#autoUpdateChk').addEventListener('change', async (e) => {
    try { await tld.saveSettings({ autoUpdate: e.target.checked }); askBar.hidden = true; } catch (err) { toast('Could not save the setting: ' + TD.code(err), 'err'); }
  });
  $('#updateCheckBtn').addEventListener('click', () => check(true));
  $('#settingsBtn').addEventListener('click', () => { say(''); fill(); });

  async function auto() {
    await tld.ready;
    const s = tld.settings();
    if (s.autoUpdate !== true) {
      if (s.autoUpdate === null && (await isReady())) askBar.hidden = false;
      return;
    }
    if (Date.now() - (Number(s.lastUpdateCheck) || 0) < DAY) return;
    await check(false);
  }
  if (tld.inTauri) setTimeout(() => { auto().catch(() => { }); }, 1500);

  window.tldUpdates = { check, install, fill, isReady };
})();
