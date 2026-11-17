'use strict';
/* Start-up: signed-in cloud mode when Supabase is configured, otherwise (or by choice) the local demo. */
(async function boot() {
  let local = false; try { local = localStorage.getItem(MODE_KEY) === 'local'; } catch (e) { /* ignore */ }
  if (window.PM_CONFIG && window.supabase && !local) {
    try { await cloudInit(); return; }
    catch (e) {
      console.error(e);
      const a = authShell(`<h2>Can’t reach the server</h2><div class="note" style="margin:6px 0 14px">${esc(errText(e))}</div><div class="stack" style="gap:10px"><button class="btn primary" style="justify-content:center" id="retry">Try again</button><button class="btn" style="justify-content:center" id="demo">Use the demo (this browser only)</button></div>`);
      $('#retry', a).addEventListener('click', () => location.reload());
      $('#demo', a).addEventListener('click', () => { try { localStorage.setItem(MODE_KEY, 'local'); } catch (e2) { /* ignore */ } location.reload(); });
      return;
    }
  }
  load(); render();
})();
