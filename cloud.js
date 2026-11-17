'use strict';
/* Cloud mode: Supabase auth + a per-firm records table with role-based row security.
   The app keeps its in-memory `db`; every save is diffed against what the server has and only changes are sent.
   Other people's changes arrive over realtime and are merged into `db`. */
const cloud = { on: false, sb: null, user: null, member: null, firm: null, team: [], shadow: new Map(), timer: null, busy: false, again: false, chan: null, state: '' };
const MODE_KEY = 'apollo-pm-mode';
const KINDS = { employees: 'employee', clients: 'client', projects: 'project', time: 'time', expenses: 'expense', invoices: 'invoice', tasks: 'task', plan: 'plan', accounts: 'account', vendors: 'vendor', bills: 'bill', payruns: 'payrun', journals: 'journal' };
const ARR_OF = Object.fromEntries(Object.entries(KINDS).map(([a, k]) => [k, a]));
const ROLES = { admin: 'Admin', manager: 'Project manager', accounting: 'Accounting', staff: 'Staff' };
const VIEW_ROLES = { ledger: ['admin', 'accounting'], payables: ['admin', 'accounting'], payroll: ['admin', 'accounting'], financials: ['admin', 'accounting'], billing: ['admin', 'accounting', 'manager'], reports: ['admin', 'accounting', 'manager'], expenses: ['admin', 'accounting', 'manager'], clients: ['admin', 'accounting', 'manager'], staff: ['admin', 'accounting', 'manager'] };
const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}) : x);
const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const errText = e => (e && (e.message || e.error_description || e.details)) || String(e);

/* ---------- permissions (friendly UI gating; the database enforces the real rules) ---------- */
allowed = v => !cloud.on || !VIEW_ROLES[v] || VIEW_ROLES[v].includes(cloud.member?.role);
const isAdmin = () => !cloud.on || cloud.member?.role === 'admin';
timeEmps = () => { const act = db.employees.filter(e => e.active); if (!cloud.on || cloud.member.role !== 'staff') return act; return act.filter(e => e.id === cloud.member.emp_id); };

/* ---------- sync ---------- */
function snapshot() {
  const m = new Map();
  for (const [arr, kind] of Object.entries(KINDS)) for (const r of db[arr] || []) m.set(kind + '|' + r.id, canon(r));
  m.set('settings|main', canon(db.settings));
  return m;
}
const split = k => { const i = k.indexOf('|'); return [k.slice(0, i), k.slice(i + 1)]; };
function setState(s) { cloud.state = s; const el = document.getElementById('syncState'); if (el) el.innerHTML = syncLabel(); }
const syncLabel = () => ({ pending: '<span style="color:var(--amber)">● Saving…</span>', saving: '<span style="color:var(--amber)">● Saving…</span>', error: '<span style="color:var(--red)">● Not saved</span>' })[cloud.state] || '<span style="color:var(--mint)">● Synced</span>';
cloud.queue = () => { clearTimeout(cloud.timer); cloud.timer = setTimeout(push, 500); setState('pending'); };
async function push() {
  clearTimeout(cloud.timer); cloud.timer = null;
  if (cloud.busy) { cloud.again = true; return; }
  cloud.busy = true; setState('saving');
  try {
    const cur = snapshot(), up = [], del = new Map();
    for (const [k, s] of cur) if (cloud.shadow.get(k) !== s) { const [kind, id] = split(k); up.push({ firm_id: cloud.firm.id, kind, id, data: JSON.parse(s) }); }
    for (const k of cloud.shadow.keys()) if (!cur.has(k)) { const [kind, id] = split(k); if (!del.has(kind)) del.set(kind, []); del.get(kind).push(id); }
    for (const c of chunks(up, 300)) { const { error } = await cloud.sb.from('records').upsert(c, { onConflict: 'firm_id,kind,id' }); if (error) throw error; c.forEach(r => cloud.shadow.set(r.kind + '|' + r.id, cur.get(r.kind + '|' + r.id))); }
    for (const [kind, ids] of del) for (const c of chunks(ids, 100)) { const { error } = await cloud.sb.from('records').delete().eq('firm_id', cloud.firm.id).eq('kind', kind).in('id', c); if (error) throw error; c.forEach(i => cloud.shadow.delete(kind + '|' + i)); }
    setState('');
  } catch (e) {
    console.error(e); setState('error'); toast('Could not save that: ' + errText(e) + ' Reloading from the server.');
    try { await loadAll(); render(); } catch (e2) { /* offline */ }
  } finally { cloud.busy = false; if (cloud.again) { cloud.again = false; cloud.queue(); } }
}
async function fetchAll() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await cloud.sb.from('records').select('kind,id,data').eq('firm_id', cloud.firm.id).order('kind').order('id').range(from, from + 999);
    if (error) throw error; rows.push(...data); if (data.length < 1000) break;
  }
  return rows;
}
function buildDb(rows) {
  const d = { v: 1, settings: null }; Object.keys(KINDS).forEach(a => d[a] = []);
  for (const r of rows) { if (r.kind === 'settings') d.settings = r.data; else if (ARR_OF[r.kind]) d[ARR_OF[r.kind]].push(r.data); }
  d.settings = { firm: cloud.firm.name, overhead: 150, markup: 10, terms: 30, nextInvoice: 1001, ...(d.settings || {}) };
  return d;
}
async function loadAll() { db = buildDb(await fetchAll()); ensure(false); memo = null; bookReset(); cloud.shadow = snapshot(); }
function applyChange(p) {
  const row = p.eventType === 'DELETE' ? p.old : p.new; if (!row || row.firm_id !== cloud.firm.id) return;
  const key = row.kind + '|' + row.id;
  if (p.eventType === 'DELETE') { if (!cloud.shadow.has(key)) return; cloud.shadow.delete(key); if (row.kind !== 'settings' && ARR_OF[row.kind]) db[ARR_OF[row.kind]] = db[ARR_OF[row.kind]].filter(x => x.id !== row.id); }
  else { const s = canon(row.data); if (cloud.shadow.get(key) === s) return; cloud.shadow.set(key, s); if (row.kind === 'settings') db.settings = { ...db.settings, ...row.data }; else if (ARR_OF[row.kind]) { const arr = db[ARR_OF[row.kind]], i = arr.findIndex(x => x.id === row.id); if (i >= 0) arr[i] = row.data; else arr.push(row.data); } }
  memo = null; bookReset(); softRender();
}
function softRender() {
  clearTimeout(softRender.t);
  const a = document.activeElement, typing = a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.closest('#view, #top');
  if (document.getElementById('modal').innerHTML || typing) softRender.t = setTimeout(softRender, 1500); else softRender.t = setTimeout(render, 120);
}
function subscribe() {
  if (cloud.chan) cloud.sb.removeChannel(cloud.chan);
  cloud.chan = cloud.sb.channel('firm-' + cloud.firm.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: 'firm_id=eq.' + cloud.firm.id }, applyChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: 'firm_id=eq.' + cloud.firm.id }, async () => { const old = cloud.member?.role; await loadMember(); if (cloud.member && old !== cloud.member.role) { await loadAll(); } render(); })
    .subscribe();
}
window.addEventListener('beforeunload', e => { if (cloud.on && (cloud.timer || cloud.busy)) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (cloud.on && document.visibilityState === 'hidden' && cloud.timer) push(); });

/* ---------- session / firm ---------- */
async function loadMember() {
  const { data: info, error } = await cloud.sb.rpc('firm_info'); if (error) throw error;
  if (!info || !info.length) { cloud.member = null; cloud.firm = null; return false; }
  const { data: me } = await cloud.sb.from('members').select('*').eq('user_id', cloud.user.id).maybeSingle();
  cloud.firm = { id: me.firm_id, name: info[0].name, code: info[0].join_code };
  cloud.member = { role: info[0].role, emp_id: me.emp_id, name: me.name, email: me.email };
  const { data: team } = await cloud.sb.from('members').select('*').order('created_at'); cloud.team = team || [];
  return true;
}
async function startCloud() {
  cloud.on = true; persist = () => cloud.queue();
  await loadAll();
  ui.tsEmp = cloud.member.emp_id || ui.tsEmp;
  subscribe(); $('#auth').innerHTML = ''; $('#auth').hidden = true; document.body.classList.remove('authing'); render();
}

/* ---------- auth screens ---------- */
function authShell(inner) { document.body.classList.add('authing'); const a = $('#auth'); a.hidden = false; a.innerHTML = `<div class="authcard"><div class="brand" style="padding:0 0 18px"><div class="mark"></div><div><h1>Project Manager</h1><div class="tag">Apollo Development</div></div></div>${inner}</div>`; return a; }
function showAuth(mode = 'in', msg = '') {
  const up = mode === 'up', rec = mode === 'reset';
  const a = authShell(`<h2>${rec ? 'Set a new password' : up ? 'Create your account' : 'Sign in'}</h2><div class="note" style="margin:4px 0 14px">${rec ? 'Choose a new password for your account.' : up ? 'Use your work email. You’ll create or join your firm next.' : 'Projects, people, budgets and books in one place.'}</div>
    <form id="af" class="stack" style="gap:12px">${rec ? '' : '<div class="fld"><label>Email</label><input class="inp" type="email" id="ae" autocomplete="email" required></div>'}
    ${mode === 'forgot' ? '' : `<div class="fld"><label>${rec ? 'New password' : 'Password'}</label><input class="inp" type="password" id="ap" minlength="8" autocomplete="${up || rec ? 'new-password' : 'current-password'}" required></div>`}
    <div class="msg" id="am">${esc(msg)}</div><button class="btn primary" style="justify-content:center">${rec ? 'Save password' : mode === 'forgot' ? 'Email me a reset link' : up ? 'Create account' : 'Sign in'}</button></form>
    <div class="row" style="margin-top:14px;justify-content:space-between"><span class="note">${up ? 'Have an account? <a href="#" data-am="in"><u>Sign in</u></a>' : mode === 'in' ? 'New here? <a href="#" data-am="up"><u>Create an account</u></a>' : '<a href="#" data-am="in"><u>Back to sign in</u></a>'}</span>${mode === 'in' ? '<a class="note" href="#" data-am="forgot"><u>Forgot password?</u></a>' : ''}</div>
    <div class="or"><span>or</span></div><button class="btn" style="width:100%;justify-content:center" id="demo">Try the demo (no account, this browser only)</button>`);
  a.querySelectorAll('[data-am]').forEach(l => l.addEventListener('click', e => { e.preventDefault(); showAuth(l.dataset.am); }));
  $('#demo', a).addEventListener('click', () => { try { localStorage.setItem(MODE_KEY, 'local'); } catch (e) { /* ignore */ } location.reload(); });
  const say = (t, bad) => { const m = $('#am', a); m.textContent = t; m.className = 'msg' + (bad ? ' bad' : ''); };
  $('#af', a).addEventListener('submit', async ev => {
    ev.preventDefault(); const btn = a.querySelector('form .btn'); btn.disabled = true; say('');
    try {
      const email = $('#ae', a)?.value.trim(), pw = $('#ap', a)?.value;
      if (rec) { const { error } = await cloud.sb.auth.updateUser({ password: pw }); if (error) throw error; await afterAuth(); return; }
      if (mode === 'forgot') { const { error } = await cloud.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw error; say('Check your email for a reset link.'); return; }
      if (up) { const { data, error } = await cloud.sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: location.origin + location.pathname } }); if (error) throw error; if (!data.session) { say('Almost there — check your email to confirm your address, then sign in.'); return; } cloud.user = data.user; await afterAuth(); return; }
      const { data, error } = await cloud.sb.auth.signInWithPassword({ email, password: pw }); if (error) throw error; cloud.user = data.user; await afterAuth();
    } catch (e) { say(errText(e), true); } finally { btn.disabled = false; }
  });
}
function showOnboard(msg = '') {
  const a = authShell(`<h2>Set up your firm</h2><div class="note" style="margin:4px 0 14px">Signed in as ${esc(cloud.user.email)}.</div>
    <div class="seg" style="margin-bottom:14px"><button class="on" data-ob="new">Create a firm</button><button data-ob="join">Join with a code</button></div>
    <form id="of" class="stack" style="gap:12px"><div class="fld"><label>Your name</label><input class="inp" id="on" required autocomplete="name"></div>
    <div class="fld" id="o-firm"><label>Firm name</label><input class="inp" id="of1" required></div>
    <div class="fld" id="o-data"><label>Starting data</label><select class="inp" id="od"><option value="demo">Sample data — explore with a fictional firm</option><option value="blank">Blank — start fresh</option></select></div>
    <div class="fld" id="o-code" hidden><label>Join code</label><input class="inp mono" id="oc" placeholder="from your firm’s admin"></div>
    <div class="msg" id="am">${esc(msg)}</div><button class="btn primary" id="obtn" style="justify-content:center">Create firm</button></form>
    <div class="row" style="margin-top:14px"><a class="note" href="#" id="so"><u>Sign out</u></a></div>`);
  let join = false;
  a.querySelectorAll('[data-ob]').forEach(b => b.addEventListener('click', () => { join = b.dataset.ob === 'join'; a.querySelectorAll('[data-ob]').forEach(x => x.classList.toggle('on', x === b)); $('#o-firm', a).hidden = $('#o-data', a).hidden = join; $('#o-code', a).hidden = !join; $('#of1', a).required = !join; $('#oc', a).required = join; $('#obtn', a).textContent = join ? 'Join firm' : 'Create firm'; }));
  $('#so', a).addEventListener('click', e => { e.preventDefault(); A.signOut(); });
  $('#of', a).addEventListener('submit', async ev => {
    ev.preventDefault(); const btn = $('#obtn', a); btn.disabled = true; const say = t => { $('#am', a).textContent = t; $('#am', a).className = 'msg bad'; };
    try {
      if (join) { const { error } = await cloud.sb.rpc('join_firm', { p_code: $('#oc', a).value, p_user_name: $('#on', a).value }); if (error) throw error; }
      else {
        const name = $('#of1', a).value.trim(), seed = $('#od', a).value === 'demo';
        const { error } = await cloud.sb.rpc('create_firm', { p_name: name, p_user_name: $('#on', a).value }); if (error) throw error;
        await loadMember(); cloud.on = true; persist = () => cloud.queue(); cloud.shadow = new Map();
        db = seed ? makeSeed() : { v: 1, settings: { firm: name, overhead: 150, markup: 10, terms: 30, nextInvoice: 1001, theme: 'auto' }, employees: [], clients: [], projects: [], time: [], expenses: [], invoices: [], tasks: [], plan: [], accounts: [], vendors: [], bills: [], payruns: [], journals: [] };
        db.settings.firm = name; delete db.settings.theme; ensure(true); btn.textContent = 'Saving your firm…'; await push(); if (cloud.state === 'error') throw new Error('Could not save your starting data.');
      }
      await afterAuth();
    } catch (e) { say(errText(e)); btn.disabled = false; }
  });
}
async function afterAuth() {
  try { if (await loadMember()) await startCloud(); else showOnboard(); }
  catch (e) { console.error(e); showAuth('in', errText(e)); }
}
async function cloudInit() {
  const cfg = window.PM_CONFIG; cloud.sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  cloud.sb.auth.onAuthStateChange((ev, s) => { if (ev === 'PASSWORD_RECOVERY') showAuth('reset'); if (ev === 'SIGNED_OUT' && cloud.on) location.reload(); });
  const { data } = await cloud.sb.auth.getSession();
  if (data?.session && !/type=recovery/.test(location.hash)) { cloud.user = data.session.user; return afterAuth(); }
  if (/type=recovery/.test(location.hash)) return;
  showAuth('in');
}

/* ---------- actions ---------- */
A.signOut = async () => { try { await cloud.sb.auth.signOut(); } catch (e) { /* ignore */ } location.reload(); };
A.goAuth = () => { try { localStorage.removeItem(MODE_KEY); } catch (e) { /* ignore */ } location.reload(); };
A.copyCode = () => { navigator.clipboard?.writeText(cloud.firm.code).then(() => toast('Join code copied'), () => toast(cloud.firm.code)); };
A.rotateCode = async () => { if (!confirm('Generate a new join code? The old one stops working.')) return; const { data, error } = await cloud.sb.rpc('rotate_join_code'); if (error) return toast(errText(error)); cloud.firm.code = data; render(); toast('New join code ready'); };
A.memRemove = async d => { if (!confirm('Remove this person from the firm? They lose access immediately.')) return; const { error } = await cloud.sb.rpc('remove_member', { p_user: d.u }); if (error) return toast(errText(error)); await loadMember(); render(); toast('Removed'); };
C.memRole = async el => { const m = cloud.team.find(x => x.user_id === el.dataset.u); const { error } = await cloud.sb.rpc('set_member', { p_user: el.dataset.u, p_role: el.value, p_emp: m?.emp_id || '' }); if (error) toast(errText(error)); await loadMember(); render(); };
C.memEmp = async el => { const m = cloud.team.find(x => x.user_id === el.dataset.u); const { error } = await cloud.sb.rpc('set_member', { p_user: el.dataset.u, p_role: m.role, p_emp: el.value }); if (error) toast(errText(error)); await loadMember(); render(); };
C.firmName = async el => { db.settings.firm = el.value; cloud.firm.name = el.value; commit('Saved'); };

/* ---------- shared UI pieces ---------- */
sessionFoot = () => cloud.on
  ? `<div class="who" style="margin-bottom:6px"><span class="avatar">${esc(initials(cloud.member.name || cloud.member.email || '?'))}</span><span style="min-width:0"><div class="nm" style="font-size:12.5px;overflow:hidden;text-overflow:ellipsis">${esc(cloud.member.name || cloud.member.email)}</div><div class="sm">${ROLES[cloud.member.role]}</div></span></div><div class="row" style="justify-content:space-between;gap:6px"><span class="mono sm" id="syncState">${syncLabel()}</span><button class="btn sm ghost" data-a="signOut">Sign out</button></div>`
  : `${esc(db.settings.firm)}<div class="sm" style="margin:4px 0 6px">Demo mode — data stays in this browser.</div>${window.PM_CONFIG ? '<button class="btn sm" data-a="goAuth">Sign in / create firm</button>' : ''}`;
function teamPanel() {
  if (!cloud.on || cloud.member.role !== 'admin') return '';
  const emps = db.employees;
  return `<div class="panel"><div class="hd"><span class="eyebrow">Team &amp; access</span></div><div class="bd" style="display:grid;gap:14px">
    <div class="row"><div class="fld" style="min-width:220px"><label>Firm join code</label><div class="row"><span class="mono nm" style="font-size:16px;letter-spacing:.08em">${esc(cloud.firm.code || '')}</span><button class="btn sm" data-a="copyCode">Copy</button><button class="btn sm ghost" data-a="rotateCode">New code</button></div></div>
      <div class="note" style="flex:1;min-width:240px">Teammates create an account at this site, choose “Join with a code”, and start as <b>Staff</b>. Promote them here, and link each login to their employee profile so they can enter their own time.</div></div>
    <table><thead><tr><th style="padding-left:0">Person</th><th>Role</th><th>Employee profile</th><th></th></tr></thead><tbody>
    ${cloud.team.map(m => `<tr><td style="padding-left:0"><div class="nm">${esc(m.name || '—')}${m.user_id === cloud.user.id ? ' <span class="sm">(you)</span>' : ''}</div><div class="sm">${esc(m.email || '')}</div></td>
      <td><select class="inp sm" data-c="memRole" data-u="${m.user_id}">${Object.entries(ROLES).map(([v, l]) => opt(v, l, m.role)).join('')}</select></td>
      <td><select class="inp sm" data-c="memEmp" data-u="${m.user_id}"><option value="">— Not linked —</option>${emps.map(e => opt(e.id, e.name, m.emp_id)).join('')}</select></td>
      <td class="r">${m.user_id === cloud.user.id ? '' : `<button class="btn sm danger" data-a="memRemove" data-u="${m.user_id}">Remove</button>`}</td></tr>`).join('')}</tbody></table>
    <div class="note"><b>Who can do what.</b> Admin: everything. Accounting: books, billing, expenses, time. Project manager: projects, clients, tasks, schedule, time, billing — not the books or staff pay. Staff: their own timesheet and assigned tasks. Ledger, payables and payroll are hidden from everyone but Admin and Accounting.</div></div></div>`;
}
A.eraseAll = async () => {
  const n = prompt(`This permanently erases every project, timesheet, invoice and ledger entry for ${cloud.firm.name}, for everyone.\n\nType the firm name to confirm:`);
  if (n === null) return; if (n.trim() !== cloud.firm.name) return toast('Firm name did not match — nothing erased.');
  const keep = db.settings; db = { v: 1, settings: keep }; Object.keys(KINDS).forEach(a => db[a] = []); ensure(true); commit('All firm data erased');
};
