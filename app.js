'use strict';
/* Apollo Project Manager — single-file app logic. Data lives in the browser (localStorage). */
const KEY = 'apollo-pm-v1';
const OH = ['General admin', 'Marketing / proposals', 'Training', 'PTO', 'Holiday'];
const PSTAT = ['Active', 'Proposal', 'On hold', 'Closed'];
const TSTAT = ['To do', 'In progress', 'Review', 'Done'];
const CATS = ['Subconsultant', 'Permit fee', 'Mileage', 'Printing', 'Equipment', 'Travel', 'Other'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const D = s => new Date(s + 'T12:00:00');
const today = () => iso(new Date());
const addDays = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return iso(d); };
const monday = s => { const d = D(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const diffDays = (a, b) => Math.round((D(a) - D(b)) / 864e5);
const fd = s => s ? D(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
const fdy = s => s ? D(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const $m = n => usd.format(Math.round(n || 0));
const $k = n => { n = n || 0; const a = Math.abs(n); return a >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : a >= 1e4 ? (n < 0 ? '-' : '') + '$' + Math.round(a / 1e3) + 'k' : $m(n); };
const pc = n => Math.round((n || 0) * 100) + '%';
const hr = n => (Math.round((n || 0) * 10) / 10).toLocaleString('en-US');
const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
const initials = n => n.split(',')[0].split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const opt = (v, l, sel) => `<option value="${esc(v)}" ${String(sel ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`;

/* ---------- state ---------- */
let db, memo = null;
let persist = null, allowed = () => true, timeEmps = null, sessionFoot = null;   // hooks set by cloud.js
const ui = { pf: 'Active', pq: '', tsEmp: '', tsWeek: monday(today()), tsRows: [], tsAdd: '', sched: monday(today()), rep: 'profit', repW: 4, tp: '', te: '' };
function load() {
  try { const s = localStorage.getItem(KEY); if (s) { db = JSON.parse(s); ensure(true); return; } } catch (e) { /* storage unavailable */ }
  db = makeSeed(); ensure(true);
}
// fill in anything an older save (or a restricted role) doesn't have
function ensure(seedAccounts) {
  for (const k of ['employees', 'clients', 'projects', 'time', 'expenses', 'invoices', 'tasks', 'plan', 'accounts', 'vendors', 'bills', 'payruns', 'journals']) db[k] = db[k] || [];
  if (db.settings.payWithhold == null) db.settings.payWithhold = 22;
  if (db.settings.payEmployer == null) db.settings.payEmployer = 8.65;
  if (seedAccounts && !db.accounts.length) db.accounts = defaultAccounts();
}
const themePref = () => (typeof cloud !== 'undefined' && cloud.on) ? (localStorage.getItem('apollo-pm-theme') || 'auto') : (db.settings.theme || 'auto');
function save() { memo = null; if (typeof bookReset === 'function') bookReset(); if (persist) return persist(); try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* storage unavailable */ } }
const emp = id => db.employees.find(e => e.id === id);
const proj = id => db.projects.find(p => p.id === id);
const client = id => db.clients.find(c => c.id === id);
const ename = id => emp(id)?.name || 'Unassigned';
const invTotal = v => sum(v.lines, l => l.amount);

/* ---------- project math ----------
   spent  = labor at billing rates + billable expenses (with markup) — the burn against the fee
   earned = fixed fee: fee × % complete · hourly: spent
   WIP    = earned − invoiced
   cost   = direct labor × (1 + overhead rate) + expenses at cost;  profit = earned − cost */
function stats() {
  if (memo) return memo;
  const E = Object.fromEntries(db.employees.map(e => [e.id, e]));
  const oh = (db.settings.overhead || 0) / 100, t0 = today(), S = {};
  const bucket = (s, fid) => s.ph[fid] || (s.ph[fid] = { f: { id: fid, name: 'Unassigned', fee: 0, hours: 0, pct: 0 }, hrs: 0, lb: 0, lc: 0, eb: 0, ec: 0, billed: 0 });
  for (const p of db.projects) { S[p.id] = { p, ph: {}, byEmp: {} }; p.phases.forEach(f => S[p.id].ph[f.id] = { f, hrs: 0, lb: 0, lc: 0, eb: 0, ec: 0, billed: 0 }); }
  for (const t of db.time) {
    const s = S[t.projId], e = E[t.empId]; if (!s || !e) continue;
    const b = bucket(s, t.phaseId); b.hrs += t.hours; b.lb += t.hours * e.bill; b.lc += t.hours * e.cost;
    const m = s.byEmp[e.id] || (s.byEmp[e.id] = { hrs: 0, lb: 0 }); m.hrs += t.hours; m.lb += t.hours * e.bill;
  }
  for (const x of db.expenses) { const s = S[x.projId]; if (!s) continue; const b = bucket(s, x.phaseId); b.ec += x.amount; if (x.billable) b.eb += x.amount * (1 + (x.markup || 0) / 100); }
  for (const v of db.invoices) { const s = S[v.projId]; if (!s) continue; v.lines.forEach(l => bucket(s, l.phaseId).billed += l.amount); }
  for (const s of Object.values(S)) {
    const p = s.p, fixed = p.type === 'fixed', L = Object.values(s.ph);
    L.forEach(b => { b.spent = b.lb + b.eb; b.earned = fixed ? b.f.fee * (b.f.pct || 0) / 100 : b.spent; b.wip = b.earned - b.billed; });
    for (const k of ['hrs', 'lb', 'lc', 'eb', 'ec', 'billed', 'spent', 'earned', 'wip']) s[k] = sum(L, b => b[k]);
    s.fee = sum(p.phases, f => f.fee); s.bhrs = sum(p.phases, f => f.hours);
    s.cost = s.lc * (1 + oh) + s.ec; s.profit = s.earned - s.cost; s.margin = s.earned ? s.profit / s.earned : 0;
    s.burn = s.fee ? s.spent / s.fee : 0;
    s.pct = fixed ? (s.fee ? s.earned / s.fee : 0) : Math.min(1, s.burn);
    s.eac = fixed ? (s.pct > 0.05 ? s.spent / s.pct : Math.max(s.fee, s.spent)) : s.spent;
    s.late = p.due && p.due < t0 && s.pct < 1;
    if (p.status !== 'Active') s.health = { l: p.status, t: p.status === 'Proposal' ? 'vio' : '' };
    else if (s.burn > 1) s.health = { l: fixed ? 'Over budget' : 'Over NTE', t: 'bad' };
    else if (fixed ? s.burn - s.pct > 0.1 : s.burn > 0.85) s.health = { l: fixed ? 'At risk' : 'Near limit', t: 'warn' };
    else if (s.late) s.health = { l: 'Behind schedule', t: 'warn' };
    else s.health = { l: 'On track', t: 'ok' };
  }
  return memo = S;
}
function util(empId, weeks = 4) {
  const to = monday(today()), from = addDays(to, -7 * weeks), e = emp(empId);
  let bill = 0, tot = 0;
  for (const t of db.time) if (t.empId === empId && t.date >= from && t.date < to) { tot += t.hours; if (t.projId) bill += t.hours; }
  const cap = (e?.cap || 40) * weeks;
  return { bill, tot, cap, pct: cap ? bill / cap : 0 };
}
const planned = (empId, week) => sum(db.plan.filter(a => a.empId === empId && a.week === week), a => a.hours);
const aging = () => { const t0 = today(), b = [0, 0, 0, 0, 0]; db.invoices.filter(v => v.status === 'Sent').forEach(v => { const d = diffDays(t0, v.due); b[d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4] += invTotal(v); }); return b; };
const badge = (l, t = '') => `<span class="badge ${t}">${esc(l)}</span>`;
const meter = (fill, tick, tone = '') => `<div class="meter"><i class="${tone}" style="width:${Math.max(0, Math.min(100, fill * 100))}%"></i>${tick == null ? '' : `<b style="left:calc(${Math.max(0, Math.min(100, tick * 100))}% - 1px)"></b>`}</div>`;
const who = id => { const e = emp(id); return e ? `<span class="who"><span class="avatar">${esc(initials(e.name))}</span><span>${esc(e.name.split(',')[0])}</span></span>` : '<span class="sm">Unassigned</span>'; };
const plabel = p => p ? `<span class="mono sm">${esc(p.num)}</span> ${esc(p.name)}` : '';
function toast(m) { $('#toast').innerHTML = `<div>${esc(m)}</div>`; clearTimeout(toast.t); toast.t = setTimeout(() => $('#toast').innerHTML = '', 2400); }

/* ---------- alerts ---------- */
function alerts() {
  const S = stats(), t0 = today(), out = [], nw = addDays(monday(t0), 7);
  for (const p of db.projects.filter(p => p.status === 'Active')) {
    const s = S[p.id];
    if (s.health.t === 'bad') out.push({ t: 'bad', h: `#/project/${p.id}`, a: `${p.num} is over budget`, d: `${$m(s.spent)} spent against a ${$m(s.fee)} fee — ${p.name}` });
    else if (s.health.l === 'At risk') out.push({ t: '', h: `#/project/${p.id}`, a: `${p.num} is burning ahead of progress`, d: `${pc(s.burn)} of fee spent at ${pc(s.pct)} complete — projected ${$m(s.eac)} at completion` });
    else if (s.health.l === 'Near limit') out.push({ t: '', h: `#/project/${p.id}`, a: `${p.num} is near its not-to-exceed`, d: `${pc(s.burn)} of ${$m(s.fee)} used — ${p.name}` });
    if (s.late) out.push({ t: '', h: `#/project/${p.id}`, a: `${p.num} is past its due date`, d: `Due ${fd(p.due)}, ${pc(s.pct)} complete` });
  }
  const od = db.invoices.filter(v => v.status === 'Sent' && v.due < t0);
  if (od.length) out.push({ t: 'bad', h: '#/billing', a: `${od.length} invoice${od.length > 1 ? 's' : ''} overdue`, d: `${$m(sum(od, invTotal))} past terms — oldest ${diffDays(t0, od.map(v => v.due).sort()[0])} days` });
  const lt = db.tasks.filter(k => k.status !== 'Done' && k.due && k.due < t0);
  if (lt.length) out.push({ t: '', h: '#/tasks', a: `${lt.length} task${lt.length > 1 ? 's' : ''} overdue`, d: lt.slice(0, 2).map(k => k.title).join(' · ') + (lt.length > 2 ? ' …' : '') });
  for (const e of db.employees.filter(e => e.active)) { const h = planned(e.id, nw); if (h > e.cap) out.push({ t: '', h: '#/schedule', a: `${e.name.split(',')[0]} is overbooked next week`, d: `${hr(h)} h planned against ${e.cap} h capacity` }); }
  const un = db.time.filter(t => !t.approved && t.date < monday(t0));
  if (un.length) out.push({ t: 'info', h: '#/time', a: 'Timesheets waiting for approval', d: `${hr(sum(un, t => t.hours))} h from ${new Set(un.map(t => t.empId)).size} people` });
  const big = Object.values(S).filter(s => s.p.status !== 'Proposal' && s.wip > 5000).sort((a, b) => b.wip - a.wip)[0];
  if (big) out.push({ t: 'info', h: '#/billing', a: `${$m(sum(Object.values(S).filter(s => s.p.status !== 'Proposal'), s => Math.max(0, s.wip)))} ready to invoice`, d: `Largest: ${big.p.num} at ${$m(big.wip)}` });
  if (typeof bookAlerts === 'function') out.push(...bookAlerts());
  return out;
}

/* ---------- views ---------- */
const V = {};
V.dashboard = () => {
  const S = stats(), t0 = today(), act = db.projects.filter(p => p.status === 'Active'), bk = typeof bookKpi === 'function' ? bookKpi() : '';
  const live = Object.values(S).filter(s => s.p.status !== 'Proposal');
  const backlog = sum(act, p => Math.max(0, S[p.id].fee - S[p.id].earned)), prop = sum(db.projects.filter(p => p.status === 'Proposal'), p => S[p.id].fee);
  const wip = sum(live, s => Math.max(0, s.wip)), sent = db.invoices.filter(v => v.status === 'Sent'), ar = sum(sent, invTotal), odue = sum(sent.filter(v => v.due < t0), invTotal);
  const tech = db.employees.filter(e => e.active && e.target > 0), us = tech.map(e => util(e.id));
  const fu = sum(us, u => u.bill) / (sum(us, u => u.cap) || 1), ft = sum(tech, e => e.target * e.cap) / (sum(tech, e => e.cap) || 1) / 100;
  const earned = sum(act, p => S[p.id].earned), profit = sum(act, p => S[p.id].profit), risk = act.filter(p => ['bad', 'warn'].includes(S[p.id].health.t)).length;
  const al = alerts(), up = db.tasks.filter(k => k.status !== 'Done' && k.due && k.due <= addDays(t0, 14)).sort((a, b) => a.due < b.due ? -1 : 1).slice(0, 8);
  return {
    title: 'Dashboard', sub: `${esc(db.settings.firm)} · ${D(t0).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`,
    actions: `<button class="btn" data-a="logTime">+ Log time</button><button class="btn primary" data-a="editProject">+ New project</button>`,
    html: `<div class="stack">
    <div class="kpis ${bk ? 'k7' : ''}">
      <div class="kpi"><div class="l">Active projects</div><div class="v">${act.length}</div><div class="s ${risk ? 'warn' : 'ok'}">${risk ? risk + ' need attention' : 'All on track'}</div></div>
      <div class="kpi"><div class="l">Backlog</div><div class="v">${$k(backlog)}</div><div class="s">${prop ? '+ ' + $k(prop) + ' proposed' : 'Fee left to earn'}</div></div>
      <div class="kpi"><div class="l">Unbilled WIP</div><div class="v">${$k(wip)}</div><div class="s">Earned, not invoiced</div></div>
      <div class="kpi"><div class="l">A/R outstanding</div><div class="v">${$k(ar)}</div><div class="s ${odue ? 'bad' : ''}">${odue ? $k(odue) + ' overdue' : 'Nothing overdue'}</div></div>
      <div class="kpi"><div class="l">Utilization · 4 wk</div><div class="v">${pc(fu)}</div><div class="s ${fu < ft - 0.05 ? 'warn' : 'ok'}">Target ${pc(ft)}</div></div>
      <div class="kpi"><div class="l">Profit to date</div><div class="v">${$k(profit)}</div><div class="s ${profit < 0 ? 'bad' : ''}">${pc(earned ? profit / earned : 0)} margin, active jobs</div></div>
      ${bk}
    </div>
    <div class="grid g2">
      <div class="stack">
        <div class="panel"><div class="hd"><span class="eyebrow">Project health</span><span class="legend"><span><i></i>Fee spent</span><span><u></u>% complete</span></span></div>
          <div class="bd flush"><table><thead><tr><th style="width:36%">Project</th><th>PM</th><th style="width:24%">Budget</th><th>Due</th><th>Status</th></tr></thead><tbody>
          ${act.map(p => { const s = S[p.id]; return `<tr class="click" data-a="go" data-h="#/project/${p.id}"><td><div class="nm">${esc(p.name)}</div><div class="sm mono">${esc(p.num)} · ${esc(client(p.clientId)?.name || '')}</div></td>
            <td>${who(p.pmId)}</td><td>${meter(s.burn, p.type === 'fixed' ? s.pct : null, s.health.t === 'ok' ? '' : s.health.t)}<div class="mlabel"><span>${$k(s.spent)} of ${$k(s.fee)}</span><span>${p.type === 'fixed' ? pc(s.pct) + ' done' : 'Hourly'}</span></div></td>
            <td class="num ${s.late ? 'neg' : ''}">${fd(p.due)}</td><td>${badge(s.health.l, s.health.t)}</td></tr>`; }).join('') || `<tr><td colspan="5" class="empty">No active projects yet.</td></tr>`}
          </tbody></table></div></div>
        <div class="panel"><div class="hd"><span class="eyebrow">Team utilization · last 4 weeks</span><span class="legend"><span><i></i>Billable</span><span><u></u>Target</span></span></div>
          <div class="bd">${tech.map(e => { const u = util(e.id); return `<div class="ubar"><span class="n">${esc(e.name.split(',')[0])}</span>${meter(u.pct, e.target / 100, u.pct < e.target / 100 - 0.1 ? 'warn' : '')}<span class="num r">${pc(u.pct)}</span></div>`; }).join('')}</div></div>
      </div>
      <div class="stack">
        <div class="panel"><div class="hd"><span class="eyebrow">Needs attention <b>${al.length}</b></span></div>
          <div class="bd">${al.map(a => `<div class="alert ${a.t}" data-a="go" data-h="${a.h}"><span class="dot"></span><div><div class="t">${esc(a.a)}</div><div class="d">${esc(a.d)}</div></div></div>`).join('') || '<div class="empty">Nothing needs you right now.</div>'}</div></div>
        <div class="panel"><div class="hd"><span class="eyebrow">Next 14 days</span><a class="btn sm ghost" href="#/tasks">All tasks</a></div>
          <div class="bd">${up.map(k => `<div class="alert ${k.due < t0 ? 'bad' : k.kind !== 'Task' ? 'info' : ''}" data-a="editTask" data-id="${k.id}"><span class="dot"></span><div style="flex:1"><div class="t">${esc(k.title)}</div><div class="d">${esc(proj(k.projId)?.num || '')} · ${esc(ename(k.empId).split(',')[0])}${k.kind !== 'Task' ? ' · ' + k.kind : ''}</div></div><span class="num ${k.due < t0 ? 'neg' : ''}">${fd(k.due)}</span></div>`).join('') || '<div class="empty">No deadlines in the next two weeks.</div>'}</div></div>
      </div>
    </div></div>` };
};

V.projects = () => {
  const S = stats(), q = ui.pq.toLowerCase();
  const list = db.projects.filter(p => (ui.pf === 'All' || p.status === ui.pf) && (!q || (p.name + p.num + (client(p.clientId)?.name || '') + p.town).toLowerCase().includes(q)));
  const T = k => sum(list, p => S[p.id][k]);
  return { title: 'Projects', sub: `${db.projects.length} total`,
    actions: `<input class="inp sm" id="pq" placeholder="Search projects…" value="${esc(ui.pq)}" data-i="pq"><div class="seg">${[...PSTAT, 'All'].map(s => `<button class="${ui.pf === s ? 'on' : ''}" data-a="pf" data-v="${s}">${s}</button>`).join('')}</div><button class="btn primary" data-a="editProject">+ New project</button>`,
    html: `<div class="panel"><div class="bd flush"><table><thead><tr><th>Project</th><th>PM</th><th class="r">Fee</th><th style="width:16%">Budget</th><th class="r">Earned</th><th class="r">Billed</th><th class="r">WIP</th><th class="r">Profit</th><th>Due</th><th>Status</th></tr></thead><tbody>
    ${list.map(p => { const s = S[p.id]; return `<tr class="click" data-a="go" data-h="#/project/${p.id}"><td><div class="nm">${esc(p.name)}</div><div class="sm mono">${esc(p.num)} · ${esc(client(p.clientId)?.name || 'No client')} · ${p.type === 'fixed' ? 'Fixed fee' : 'Hourly NTE'}</div></td>
      <td>${who(p.pmId)}</td><td class="r">${$m(s.fee)}</td><td>${meter(s.burn, p.type === 'fixed' ? s.pct : null, ['ok', 'vio'].includes(s.health.t) ? '' : s.health.t || 'mute')}<div class="mlabel"><span>${pc(s.burn)} spent</span><span>${p.type === 'fixed' ? pc(s.pct) + ' done' : ''}</span></div></td>
      <td class="r">${$m(s.earned)}</td><td class="r">${$m(s.billed)}</td><td class="r">${$m(s.wip)}</td><td class="r ${s.profit < 0 ? 'neg' : ''}">${$m(s.profit)}</td><td class="num ${s.late && p.status === 'Active' ? 'neg' : ''}">${fd(p.due)}</td><td>${badge(s.health.l, s.health.t)}</td></tr>`; }).join('') || `<tr><td colspan="10" class="empty">No projects match.</td></tr>`}
    </tbody>${list.length ? `<tfoot><tr><td colspan="2">${list.length} projects</td><td class="r">${$m(T('fee'))}</td><td></td><td class="r">${$m(T('earned'))}</td><td class="r">${$m(T('billed'))}</td><td class="r">${$m(T('wip'))}</td><td class="r">${$m(T('profit'))}</td><td colspan="2"></td></tr></tfoot>` : ''}</table></div></div>` };
};

V.project = id => {
  const p = proj(id); if (!p) return { title: 'Project not found', html: '<div class="panel"><div class="empty">That project no longer exists. <a href="#/projects"><u>Back to projects</u></a></div></div>' };
  const s = stats()[id], fixed = p.type === 'fixed', t0 = today(), c = client(p.clientId);
  const tasks = db.tasks.filter(k => k.projId === id).sort((a, b) => (a.status === 'Done') - (b.status === 'Done') || (a.due < b.due ? -1 : 1));
  const exps = db.expenses.filter(x => x.projId === id).sort((a, b) => a.date < b.date ? 1 : -1), invs = db.invoices.filter(v => v.projId === id).sort((a, b) => a.date < b.date ? 1 : -1);
  const recent = db.time.filter(t => t.projId === id).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 10);
  const L = Object.values(s.ph), over = s.eac - s.fee;
  return { title: esc(p.name), sub: `<a href="#/projects">Projects</a> / <span class="mono">${esc(p.num)}</span> · ${esc(c?.name || 'No client')} · ${esc(p.town || '')} · ${fixed ? 'Fixed fee' : 'Hourly, not to exceed'} · Due ${fdy(p.due)}`,
    actions: `${badge(s.health.l, s.health.t)}<button class="btn" data-a="logTime" data-p="${id}">+ Time</button><button class="btn" data-a="editExpense" data-p="${id}">+ Expense</button><button class="btn" data-a="editTask" data-p="${id}">+ Task</button><button class="btn" data-a="editProject" data-id="${id}">Edit</button><button class="btn primary" data-a="newInvoice" data-p="${id}">Create invoice</button>`,
    html: `<div class="stack">
    <div class="kpis k5">
      <div class="kpi"><div class="l">Contract fee</div><div class="v">${$m(s.fee)}</div><div class="s">${hr(s.bhrs)} budget hours</div></div>
      <div class="kpi"><div class="l">Spent</div><div class="v">${$m(s.spent)}</div><div class="s ${s.burn > 1 ? 'bad' : ''}">${pc(s.burn)} of fee · ${hr(s.hrs)} h</div></div>
      <div class="kpi"><div class="l">Earned</div><div class="v">${$m(s.earned)}</div><div class="s">${fixed ? pc(s.pct) + ' complete' : 'Billable to date'}</div></div>
      <div class="kpi"><div class="l">Unbilled WIP</div><div class="v">${$m(s.wip)}</div><div class="s">${$m(s.billed)} invoiced</div></div>
      <div class="kpi"><div class="l">Profit</div><div class="v ${s.profit < 0 ? 'neg' : ''}">${$m(s.profit)}</div><div class="s ${fixed && over > 0 ? 'warn' : ''}">${pc(s.margin)} margin${fixed && s.pct > 0.05 ? ` · projects ${over > 0 ? $m(over) + ' over' : $m(-over) + ' under'}` : ''}</div></div>
    </div>
    ${p.notes ? `<div class="panel"><div class="bd"><span class="eyebrow">Notes</span><div style="margin-top:4px">${esc(p.notes)}</div></div></div>` : ''}
    <div class="panel"><div class="hd"><span class="eyebrow">Phases &amp; budget</span><button class="btn sm" data-a="editPhase" data-p="${id}">+ Phase</button></div>
      <div class="bd flush"><table><thead><tr><th>Phase</th><th class="r">Fee</th><th class="r">Hours</th><th style="width:18%">Budget</th><th class="r">Spent</th><th class="r">% Complete</th><th class="r">Earned</th><th class="r">Billed</th><th class="r">WIP</th><th></th></tr></thead><tbody>
      ${L.map(b => { const f = b.f, burn = f.fee ? b.spent / f.fee : (b.spent ? 1.01 : 0), pct = fixed ? (f.pct || 0) / 100 : null, tone = burn > 1 ? 'bad' : fixed && burn - pct > 0.1 ? 'warn' : '';
        return `<tr><td class="nm">${esc(f.name)}</td><td class="r">${$m(f.fee)}</td><td class="r ${b.hrs > f.hours && f.hours ? 'neg' : ''}">${hr(b.hrs)} / ${hr(f.hours)}</td><td>${meter(burn, pct, tone)}</td><td class="r">${$m(b.spent)}</td>
        <td class="r">${fixed && f.id !== 'Unassigned' && p.phases.includes(f) ? `<input class="inp sm" style="width:64px;text-align:right" type="number" min="0" max="100" step="5" value="${f.pct || 0}" data-c="pct" data-p="${id}" data-f="${f.id}">` : pc(Math.min(burn, 1))}</td>
        <td class="r">${$m(b.earned)}</td><td class="r">${$m(b.billed)}</td><td class="r ${b.wip < -1 ? 'neg' : ''}">${$m(b.wip)}</td><td class="r">${p.phases.includes(f) ? `<button class="btn sm ghost" data-a="editPhase" data-p="${id}" data-f="${f.id}">Edit</button>` : ''}</td></tr>`; }).join('') || `<tr><td colspan="10" class="empty">Add phases to set the fee and hour budget.</td></tr>`}
      </tbody><tfoot><tr><td>Total</td><td class="r">${$m(s.fee)}</td><td class="r">${hr(s.hrs)} / ${hr(s.bhrs)}</td><td></td><td class="r">${$m(s.spent)}</td><td class="r">${pc(s.pct)}</td><td class="r">${$m(s.earned)}</td><td class="r">${$m(s.billed)}</td><td class="r">${$m(s.wip)}</td><td></td></tr></tfoot></table></div></div>
    <div class="grid g2e">
      <div class="panel"><div class="hd"><span class="eyebrow">Tasks &amp; deadlines</span></div><div class="bd flush"><table><tbody>
        ${tasks.map(k => `<tr class="click" data-a="editTask" data-id="${k.id}"><td><div class="nm" style="${k.status === 'Done' ? 'text-decoration:line-through;color:var(--faint)' : ''}">${esc(k.title)}</div><div class="sm">${esc(ename(k.empId).split(',')[0])}${k.kind !== 'Task' ? ' · ' + k.kind : ''}</div></td><td class="num ${k.status !== 'Done' && k.due < t0 ? 'neg' : ''}">${fd(k.due)}</td><td>${badge(k.status, k.status === 'Done' ? 'ok' : k.status === 'To do' ? '' : 'vio')}</td></tr>`).join('') || '<tr><td class="empty">No tasks yet.</td></tr>'}</tbody></table></div></div>
      <div class="panel"><div class="hd"><span class="eyebrow">Team effort</span></div><div class="bd flush"><table><thead><tr><th>Person</th><th class="r">Hours</th><th class="r">Value</th></tr></thead><tbody>
        ${Object.entries(s.byEmp).sort((a, b) => b[1].hrs - a[1].hrs).map(([e, m]) => `<tr><td>${who(e)}</td><td class="r">${hr(m.hrs)}</td><td class="r">${$m(m.lb)}</td></tr>`).join('') || '<tr><td class="empty">No time logged.</td></tr>'}</tbody></table></div></div>
    </div>
    <div class="grid g2e">
      <div class="panel"><div class="hd"><span class="eyebrow">Expenses &amp; consultants</span></div><div class="bd flush"><table><tbody>
        ${exps.map(x => `<tr class="click" data-a="editExpense" data-id="${x.id}"><td><div class="nm">${esc(x.vendor)}</div><div class="sm">${esc(x.cat)} · ${fd(x.date)}${x.billable ? (x.markup ? ` · +${x.markup}%` : '') : ' · non-billable'}</div></td><td class="r">${$m(x.amount)}</td></tr>`).join('') || '<tr><td class="empty">No expenses.</td></tr>'}</tbody></table></div></div>
      <div class="panel"><div class="hd"><span class="eyebrow">Invoices</span></div><div class="bd flush"><table><tbody>
        ${invs.map(v => `<tr class="click" data-a="viewInvoice" data-id="${v.id}"><td><div class="nm mono">#${esc(v.num)}</div><div class="sm">${fd(v.date)} · due ${fd(v.due)}</div></td><td class="r">${$m(invTotal(v))}</td><td>${invBadge(v)}</td></tr>`).join('') || '<tr><td class="empty">Nothing invoiced yet.</td></tr>'}</tbody></table></div></div>
    </div>
    <div class="panel"><div class="hd"><span class="eyebrow">Recent time</span></div><div class="bd flush"><table><tbody>
      ${recent.map(t => `<tr><td class="num">${fd(t.date)}</td><td>${who(t.empId)}</td><td>${esc(s.ph[t.phaseId]?.f.name || '')}</td><td class="sm">${esc(t.note)}</td><td class="r">${hr(t.hours)} h</td></tr>`).join('') || '<tr><td class="empty">No time logged.</td></tr>'}</tbody></table></div></div>
    </div>` };
};
const invBadge = v => v.status === 'Paid' ? badge('Paid', 'ok') : v.status === 'Draft' ? badge('Draft') : v.due < today() ? badge(`${diffDays(today(), v.due)}d overdue`, 'bad') : badge('Sent', 'vio');

V.schedule = () => {
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(ui.sched, 7 * i)), es = db.employees.filter(e => e.active), S = stats(), cur = monday(today());
  const cell = (e, w) => { const a = db.plan.filter(x => x.empId === e.id && x.week === w), h = sum(a, x => x.hours), cls = h > e.cap ? 'over' : h >= e.cap * 0.5 ? 'ok' : 'low';
    return `<button class="cell ${cls}" data-a="editPlan" data-e="${e.id}" data-w="${w}" title="${esc(e.name)} — week of ${fd(w)}"><div class="h">${h ? hr(h) + ' h' : '—'}</div><div class="p">${a.sort((x, y) => y.hours - x.hours).map(x => esc(proj(x.projId)?.num || '?')).join(' · ') || 'Open'}</div></button>`; };
  const pp = {}; db.plan.filter(a => weeks.includes(a.week)).forEach(a => pp[a.projId] = (pp[a.projId] || 0) + a.hours);
  return { title: 'Schedule', sub: 'Planned hours per person, per week. Click a cell to assign work.',
    actions: `<button class="btn" data-a="sched" data-v="-4">← Earlier</button><button class="btn" data-a="sched" data-v="0">This week</button><button class="btn" data-a="sched" data-v="4">Later →</button>`,
    html: `<div class="stack"><div class="panel"><div class="hd"><span class="eyebrow">Resource plan</span><span class="legend"><span><i style="opacity:.35"></i>Booked</span><span><i style="background:var(--red)"></i>Over capacity</span><span>— — Open</span></span></div>
    <div class="bd" style="overflow-x:auto"><table class="sched"><thead><tr><th>Team</th>${weeks.map(w => `<th style="${w === cur ? 'color:var(--mint)' : ''}">${fd(w)}</th>`).join('')}</tr></thead><tbody>
    ${es.map(e => `<tr><td class="who-cell"><div class="nm">${esc(e.name.split(',')[0])}</div><div class="sm">${esc(e.title)} · ${e.cap} h</div></td>${weeks.map(w => `<td>${cell(e, w)}</td>`).join('')}</tr>`).join('')}
    <tr><td class="who-cell eyebrow">Booked / capacity</td>${weeks.map(w => { const h = sum(es, e => planned(e.id, w)), c = sum(es, e => e.cap); return `<td style="text-align:center" class="num">${hr(h)} / ${c}<div class="sm">${pc(h / (c || 1))}</div></td>`; }).join('')}</tr>
    </tbody></table></div></div>
    <div class="panel"><div class="hd"><span class="eyebrow">Planned vs. budget left · these 8 weeks</span></div><div class="bd flush"><table><thead><tr><th>Project</th><th class="r">Planned hours</th><th class="r">Budget hours left</th><th class="r">Difference</th></tr></thead><tbody>
    ${Object.entries(pp).sort((a, b) => b[1] - a[1]).map(([pid, h]) => { const s = S[pid]; if (!s) return ''; const left = s.bhrs - s.hrs; return `<tr class="click" data-a="go" data-h="#/project/${pid}"><td>${plabel(s.p)}</td><td class="r">${hr(h)}</td><td class="r ${left < 0 ? 'neg' : ''}">${hr(left)}</td><td class="r ${left - h < 0 ? 'neg' : ''}">${hr(left - h)}</td></tr>`; }).join('') || '<tr><td colspan="4" class="empty">Nothing planned in this window.</td></tr>'}
    </tbody></table></div></div></div>` };
};

const tsKey = t => (t.projId || '') + '|' + t.phaseId;
V.time = () => {
  const tes = timeEmps ? timeEmps() : db.employees.filter(x => x.active);
  if (!tes.some(x => x.id === ui.tsEmp)) ui.tsEmp = tes[0]?.id || '';
  if (!tes.length) return { title: 'Timesheets', html: '<div class="panel"><div class="empty">Your login isn’t linked to an employee profile yet. Ask an admin to link it under Settings → Team &amp; access.</div></div>' };
  const e = emp(ui.tsEmp), w = ui.tsWeek, dates = DAYS.map((_, i) => addDays(w, i)), t0 = today();
  const ents = db.time.filter(t => t.empId === ui.tsEmp && t.date >= w && t.date <= dates[6]);
  const keys = [...new Set([...ents.map(tsKey), ...ui.tsRows])];
  const label = k => { const [pid, f] = k.split('|'); const p = proj(pid); return p ? `<div class="nm">${esc(p.phases.find(x => x.id === f)?.name || 'General')}</div><div class="sm">${plabel(p)}</div>` : `<div class="nm">${esc(f)}</div><div class="sm">Overhead · non-billable</div>`; };
  const addP = proj(ui.tsAdd), pend = {};
  db.time.filter(t => !t.approved && t.date < monday(t0)).forEach(t => { const k = t.empId + '|' + monday(t.date); pend[k] = (pend[k] || 0) + t.hours; });
  const unapp = ents.some(t => !t.approved);
  return { title: 'Timesheets', sub: 'Enter hours by day. Totals feed budgets, WIP and utilization as you type.',
    actions: `<select class="inp sm" data-c="tsEmp">${tes.map(x => opt(x.id, x.name, ui.tsEmp)).join('')}</select><button class="btn" data-a="tsWeek" data-v="-7">←</button><span class="mono" style="font-size:12.5px">Week of ${fdy(w)}</span><button class="btn" data-a="tsWeek" data-v="7">→</button><button class="btn primary" data-a="approve" data-e="${ui.tsEmp}" data-w="${w}" ${unapp ? '' : 'disabled'}>${ents.length && !unapp ? 'Approved ✓' : 'Approve week'}</button>`,
    html: `<div class="stack"><div class="panel"><div class="bd flush"><table class="ts"><thead><tr><th>Project / phase</th>${dates.map((d, i) => `<th class="c ${i > 4 ? 'wk' : ''}" style="${d === t0 ? 'color:var(--mint)' : ''}">${DAYS[i]}<br>${fd(d)}</th>`).join('')}<th class="r">Total</th></tr></thead><tbody>
    ${keys.map(k => `<tr><td>${label(k)}</td>${dates.map(d => { const h = sum(ents.filter(t => tsKey(t) === k && t.date === d), t => t.hours); return `<td class="c"><input inputmode="decimal" value="${h || ''}" data-c="ts" data-k="${esc(k)}" data-d="${d}" aria-label="${DAYS[dates.indexOf(d)]} hours"></td>`; }).join('')}<td class="r" data-rt="${esc(k)}">${hr(sum(ents.filter(t => tsKey(t) === k), t => t.hours))}</td></tr>`).join('') || `<tr><td colspan="9" class="empty">No time this week. Add a row below to start.</td></tr>`}
    </tbody><tfoot><tr><td>Daily total</td>${dates.map(d => `<td class="c num" data-dt="${d}">${hr(sum(ents.filter(t => t.date === d), t => t.hours))}</td>`).join('')}<td class="r" id="tsTot">${hr(sum(ents, t => t.hours))} / ${e?.cap || 40}</td></tr></tfoot></table></div>
    <div class="bd row" style="border-top:1px solid var(--line)"><span class="eyebrow">Add row</span><select class="inp sm" data-c="tsAdd"><option value="">Overhead (non-billable)</option>${db.projects.filter(p => p.status === 'Active' || p.status === 'Proposal').map(p => opt(p.id, p.num + ' — ' + p.name, ui.tsAdd)).join('')}</select>
      <select class="inp sm" id="tsPhase">${(addP ? addP.phases.map(f => [f.id, f.name]) : OH.map(o => [o, o])).map(([v, l]) => opt(v, l)).join('')}</select><button class="btn sm" data-a="tsAddRow">Add</button></div></div>
    <div class="panel"><div class="hd"><span class="eyebrow">Waiting for approval</span></div><div class="bd flush"><table><tbody>
    ${Object.entries(pend).sort().map(([k, h]) => { const [eid, wk] = k.split('|'); return `<tr><td>${who(eid)}</td><td class="num">Week of ${fd(wk)}</td><td class="r">${hr(h)} h</td><td class="r"><button class="btn sm ghost" data-a="tsOpen" data-e="${eid}" data-w="${wk}">Review</button> <button class="btn sm" data-a="approve" data-e="${eid}" data-w="${wk}">Approve</button></td></tr>`; }).join('') || '<tr><td class="empty">All prior weeks are approved.</td></tr>'}
    </tbody></table></div></div></div>` };
};

V.tasks = () => {
  const t0 = today(), list = db.tasks.filter(k => (!ui.tp || k.projId === ui.tp) && (!ui.te || k.empId === ui.te));
  const cutoff = addDays(t0, -21);
  return { title: 'Tasks', sub: 'Drag a card to change its status.',
    actions: `<select class="inp sm" data-c="tp"><option value="">All projects</option>${db.projects.filter(p => p.status !== 'Closed').map(p => opt(p.id, p.num + ' — ' + p.name, ui.tp)).join('')}</select><select class="inp sm" data-c="te"><option value="">Everyone</option>${db.employees.map(e => opt(e.id, e.name, ui.te)).join('')}</select><button class="btn primary" data-a="editTask">+ New task</button>`,
    html: `<div class="board">${TSTAT.map(st => { const c = list.filter(k => k.status === st && (st !== 'Done' || k.due >= cutoff)).sort((a, b) => a.due < b.due ? -1 : 1);
      return `<div class="col" data-drop="${st}"><div class="ch"><span class="eyebrow">${st}</span><span class="mono sm">${c.length}</span></div>${c.map(k => `<div class="card" draggable="true" data-drag="${k.id}" data-a="editTask" data-id="${k.id}"><div class="pj">${esc(proj(k.projId)?.num || 'General')}${k.kind !== 'Task' ? ' · ' + esc(k.kind) : ''}</div><div class="t">${esc(k.title)}</div><div class="m"><span>${esc(ename(k.empId).split(',')[0])}</span><span class="${st !== 'Done' && k.due < t0 ? 'late' : ''}">${fd(k.due)}</span></div></div>`).join('')}</div>`; }).join('')}</div>` };
};

V.billing = () => {
  const S = stats(), t0 = today(), ag = aging(), ready = Object.values(S).filter(s => s.p.status !== 'Proposal' && s.wip > 0.5).sort((a, b) => b.wip - a.wip);
  const invs = db.invoices.slice().sort((a, b) => a.date < b.date ? 1 : -1), dr = invs.filter(v => v.status === 'Draft');
  const paid90 = sum(invs.filter(v => v.status === 'Paid' && v.paidDate >= addDays(t0, -90)), invTotal);
  return { title: 'Billing', sub: 'Turn earned work into invoices and track what clients owe.',
    html: `<div class="stack">
    <div class="kpis k4">
      <div class="kpi"><div class="l">Ready to bill</div><div class="v">${$m(sum(ready, s => s.wip))}</div><div class="s">${ready.length} projects with WIP</div></div>
      <div class="kpi"><div class="l">Drafts</div><div class="v">${$m(sum(dr, invTotal))}</div><div class="s">${dr.length} not yet sent</div></div>
      <div class="kpi"><div class="l">A/R outstanding</div><div class="v">${$m(sum(ag, x => x))}</div><div class="s ${sum(ag.slice(1), x => x) ? 'bad' : ''}">${$m(sum(ag.slice(1), x => x))} past due</div></div>
      <div class="kpi"><div class="l">Collected · 90 days</div><div class="v">${$m(paid90)}</div><div class="s">Payments received</div></div>
    </div>
    <div class="grid g2">
      <div class="panel"><div class="hd"><span class="eyebrow">Ready to bill</span></div><div class="bd flush"><table><thead><tr><th>Project</th><th class="r">Earned</th><th class="r">Billed</th><th class="r">WIP</th><th></th></tr></thead><tbody>
      ${ready.map(s => `<tr><td><div class="nm"><a href="#/project/${s.p.id}">${esc(s.p.name)}</a></div><div class="sm mono">${esc(s.p.num)} · ${s.p.type === 'fixed' ? 'Fixed fee' : 'Hourly'}</div></td><td class="r">${$m(s.earned)}</td><td class="r">${$m(s.billed)}</td><td class="r nm">${$m(s.wip)}</td><td class="r"><button class="btn sm primary" data-a="newInvoice" data-p="${s.p.id}">Invoice</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Everything earned has been invoiced.</td></tr>'}</tbody></table></div></div>
      <div class="panel"><div class="hd"><span class="eyebrow">A/R aging</span></div><div class="bd">${['Current', '1–30 days', '31–60 days', '61–90 days', '90+ days'].map((l, i) => `<div class="ubar" style="grid-template-columns:96px 1fr 84px"><span class="n">${l}</span>${meter(ag[i] / (Math.max(...ag) || 1), null, i === 0 ? '' : i < 2 ? 'warn' : 'bad')}<span class="num r">${$m(ag[i])}</span></div>`).join('')}</div></div>
    </div>
    <div class="panel"><div class="hd"><span class="eyebrow">Invoices</span></div><div class="bd flush"><table><thead><tr><th>#</th><th>Project</th><th>Client</th><th>Date</th><th>Due</th><th class="r">Amount</th><th>Status</th><th></th></tr></thead><tbody>
    ${invs.map(v => { const p = proj(v.projId); return `<tr class="click" data-a="viewInvoice" data-id="${v.id}"><td class="num">${esc(v.num)}</td><td>${plabel(p)}</td><td>${esc(client(p?.clientId)?.name || '')}</td><td class="num">${fd(v.date)}</td><td class="num">${fd(v.due)}</td><td class="r">${$m(invTotal(v))}</td><td>${invBadge(v)}</td>
      <td class="r">${v.status === 'Draft' ? `<button class="btn sm" data-a="invStatus" data-id="${v.id}" data-v="Sent">Mark sent</button>` : v.status === 'Sent' ? `<button class="btn sm" data-a="invStatus" data-id="${v.id}" data-v="Paid">Mark paid</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">No invoices yet.</td></tr>'}</tbody></table></div></div></div>` };
};

V.expenses = () => {
  const list = db.expenses.slice().sort((a, b) => a.date < b.date ? 1 : -1);
  return { title: 'Expenses', sub: 'Subconsultants, permit fees and reimbursables charged to projects.', actions: `<button class="btn primary" data-a="editExpense">+ Add expense</button>`,
    html: `<div class="panel"><div class="bd flush"><table><thead><tr><th>Date</th><th>Vendor</th><th>Category</th><th>Project</th><th class="r">Cost</th><th class="r">Markup</th><th class="r">Billable</th></tr></thead><tbody>
    ${list.map(x => `<tr class="click" data-a="editExpense" data-id="${x.id}"><td class="num">${fd(x.date)}</td><td class="nm">${esc(x.vendor)}</td><td>${esc(x.cat)}</td><td>${plabel(proj(x.projId))}</td><td class="r">${$m(x.amount)}</td><td class="r">${x.billable ? (x.markup || 0) + '%' : '—'}</td><td class="r">${x.billable ? $m(x.amount * (1 + (x.markup || 0) / 100)) : '—'}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No expenses recorded.</td></tr>'}
    </tbody>${list.length ? `<tfoot><tr><td colspan="4">Total</td><td class="r">${$m(sum(list, x => x.amount))}</td><td></td><td class="r">${$m(sum(list, x => x.billable ? x.amount * (1 + (x.markup || 0) / 100) : 0))}</td></tr></tfoot>` : ''}</table></div></div>` };
};

V.staff = () => {
  const nw = addDays(monday(today()), 7);
  return { title: 'Staff', sub: 'Rates, capacity and how billable everyone has been.', actions: `<button class="btn primary" data-a="editEmp">+ Add person</button>`,
    html: `<div class="panel"><div class="hd"><span></span><span class="legend"><span><i></i>Billable, last 4 weeks</span><span><u></u>Target</span></span></div><div class="bd flush"><table><thead><tr><th>Person</th><th class="r">Cost rate</th><th class="r">Bill rate</th><th class="r">Multiplier</th><th style="width:20%">Utilization</th><th class="r">Billable h</th><th class="r">Next week</th><th>Active projects</th></tr></thead><tbody>
    ${db.employees.map(e => { const u = util(e.id), pl = planned(e.id, nw), ps = new Set(db.plan.filter(a => a.empId === e.id && a.week >= monday(today())).map(a => a.projId));
      return `<tr class="click" data-a="editEmp" data-id="${e.id}" style="${e.active ? '' : 'opacity:.5'}"><td><span class="who"><span class="avatar">${esc(initials(e.name))}</span><span><div class="nm">${esc(e.name)}</div><div class="sm">${esc(e.title)}${e.active ? '' : ' · inactive'}</div></span></span></td>
      <td class="r">$${e.cost}/h</td><td class="r">$${e.bill}/h</td><td class="r">${e.cost ? (e.bill / e.cost).toFixed(2) + '×' : '—'}</td>
      <td>${e.target ? meter(u.pct, e.target / 100, u.pct < e.target / 100 - 0.1 ? 'warn' : '') + `<div class="mlabel"><span>${pc(u.pct)}</span><span>target ${e.target}%</span></div>` : '<span class="sm">Non-billable role</span>'}</td>
      <td class="r">${hr(u.bill)}</td><td class="r ${pl > e.cap ? 'neg' : ''}">${hr(pl)} / ${e.cap}</td><td class="mono sm">${[...ps].map(i => esc(proj(i)?.num || '')).join(' · ') || '—'}</td></tr>`; }).join('')}
    </tbody></table></div></div>` };
};

V.clients = () => {
  const S = stats();
  return { title: 'Clients', sub: 'Contacts, work in hand and balances.', actions: `<button class="btn primary" data-a="editClient">+ Add client</button>`,
    html: `<div class="panel"><div class="bd flush"><table><thead><tr><th>Client</th><th>Contact</th><th class="r">Projects</th><th class="r">Contract value</th><th class="r">Billed</th><th class="r">Open A/R</th></tr></thead><tbody>
    ${db.clients.map(c => { const ps = db.projects.filter(p => p.clientId === c.id), ids = ps.map(p => p.id);
      return `<tr class="click" data-a="editClient" data-id="${c.id}"><td class="nm">${esc(c.name)}</td><td><div>${esc(c.contact)}</div><div class="sm">${esc(c.email)}${c.phone ? ' · ' + esc(c.phone) : ''}</div></td><td class="r">${ps.filter(p => p.status === 'Active').length} active / ${ps.length}</td>
      <td class="r">${$m(sum(ps.filter(p => p.status !== 'Proposal'), p => S[p.id].fee))}</td><td class="r">${$m(sum(ps, p => S[p.id].billed))}</td><td class="r">${$m(sum(db.invoices.filter(v => v.status === 'Sent' && ids.includes(v.projId)), invTotal))}</td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">No clients yet.</td></tr>'}
    </tbody></table></div></div>` };
};

/* ---------- reports ---------- */
const REPORTS = {
  profit: ['Project profitability', () => { const S = stats(); return { cols: [['Project', 0], ['Fee', 1], ['Spent', 1], ['Earned', 1], ['Direct labor', 1], ['Overhead', 1], ['Expenses', 1], ['Profit', 1], ['Margin', 1], ['Multiplier', 1]],
    rows: db.projects.filter(p => p.status !== 'Proposal').map(p => { const s = S[p.id]; return [p.num + ' ' + p.name, $m(s.fee), $m(s.spent), $m(s.earned), $m(s.lc), $m(s.lc * db.settings.overhead / 100), $m(s.ec), $m(s.profit), pc(s.margin), s.lc ? ((s.earned - s.eb) / s.lc).toFixed(2) + '×' : '—']; }) }; }],
  util: ['Utilization', () => ({ cols: [['Person', 0], ['Title', 0], ['Billable h', 1], ['Total h', 1], ['Capacity h', 1], ['Utilization', 1], ['Target', 1], ['Billable value', 1]],
    rows: db.employees.filter(e => e.active).map(e => { const u = util(e.id, ui.repW); return [e.name, e.title, hr(u.bill), hr(u.tot), hr(u.cap), pc(u.pct), e.target + '%', $m(u.bill * e.bill)]; }) })],
  wip: ['Work in progress', () => { const S = stats(); return { cols: [['Project', 0], ['Phase', 0], ['Fee', 1], ['% Complete', 1], ['Earned', 1], ['Billed', 1], ['WIP', 1]],
    rows: db.projects.filter(p => p.status !== 'Proposal').flatMap(p => Object.values(S[p.id].ph).filter(b => Math.abs(b.wip) > 0.5).map(b => [p.num + ' ' + p.name, b.f.name, $m(b.f.fee), p.type === 'fixed' ? (b.f.pct || 0) + '%' : 'Hourly', $m(b.earned), $m(b.billed), $m(b.wip)])) }; }],
  ar: ['A/R aging', () => ({ cols: [['Invoice', 0], ['Client', 0], ['Project', 0], ['Date', 0], ['Due', 0], ['Days past due', 1], ['Amount', 1]],
    rows: db.invoices.filter(v => v.status === 'Sent').sort((a, b) => a.due < b.due ? -1 : 1).map(v => { const p = proj(v.projId); return ['#' + v.num, client(p?.clientId)?.name || '', p ? p.num + ' ' + p.name : '', fdy(v.date), fdy(v.due), Math.max(0, diffDays(today(), v.due)), $m(invTotal(v))]; }) })],
  backlog: ['Backlog', () => { const S = stats(); return { cols: [['Project', 0], ['Status', 0], ['Fee', 1], ['Earned', 1], ['Backlog', 1], ['Budget hours left', 1], ['Due', 0]],
    rows: db.projects.filter(p => p.status !== 'Closed').map(p => { const s = S[p.id]; return [p.num + ' ' + p.name, p.status, $m(s.fee), $m(s.earned), $m(Math.max(0, s.fee - s.earned)), hr(s.bhrs - s.hrs), fdy(p.due)]; }) }; }],
  time: ['Time detail', () => { const from = addDays(monday(today()), -7 * ui.repW); return { cols: [['Date', 0], ['Person', 0], ['Project', 0], ['Phase', 0], ['Note', 0], ['Hours', 1], ['Value', 1], ['Approved', 0]],
    rows: db.time.filter(t => t.date >= from).sort((a, b) => a.date < b.date ? 1 : -1).map(t => { const p = proj(t.projId), e = emp(t.empId); return [t.date, e?.name || '', p ? p.num + ' ' + p.name : 'Overhead', p ? (p.phases.find(f => f.id === t.phaseId)?.name || '') : t.phaseId, t.note || '', hr(t.hours), p ? $m(t.hours * (e?.bill || 0)) : '—', t.approved ? 'Yes' : 'No']; }) }; }],
};
V.reports = () => {
  const [name, fn] = REPORTS[ui.rep], r = fn(), period = ['util', 'time'].includes(ui.rep), show = r.rows.slice(0, 300);
  return { title: 'Reports', sub: name + (period ? ` · last ${ui.repW} full weeks` : ' · as of today'),
    actions: `${period ? `<select class="inp sm" data-c="repW">${[4, 8, 13, 26].map(n => opt(n, `Last ${n} weeks`, ui.repW)).join('')}</select>` : ''}<button class="btn" data-a="csv">Export CSV</button><button class="btn" data-a="print">Print</button>`,
    html: `<div class="stack"><div class="seg" style="align-self:flex-start;flex-wrap:wrap">${Object.entries(REPORTS).map(([k, [n]]) => `<button class="${ui.rep === k ? 'on' : ''}" data-a="rep" data-v="${k}">${n}</button>`).join('')}</div>
    <div class="panel"><div class="bd flush"><table><thead><tr>${r.cols.map(([l, n]) => `<th class="${n ? 'r' : ''}">${l}</th>`).join('')}</tr></thead><tbody>
    ${show.map(row => `<tr>${row.map((c, i) => `<td class="${r.cols[i][1] ? 'r' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${r.cols.length}" class="empty">Nothing to report.</td></tr>`}
    </tbody></table></div>${r.rows.length > 300 ? `<div class="bd note">Showing 300 of ${r.rows.length} rows — export CSV for everything.</div>` : ''}</div></div>` };
};

V.settings = () => {
  const st = db.settings, cl = typeof cloud !== 'undefined' && cloud.on, adm = typeof isAdmin === 'function' ? isAdmin() : true;
  const look = `<div class="fld"><label>Appearance</label><select class="inp" data-c="set" data-k="theme">${[['auto', 'Match system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => opt(v, l, themePref())).join('')}</select></div>`;
  if (!adm) return { title: 'Settings', sub: 'Your preferences.', html: `<div class="panel" style="max-width:520px"><div class="hd"><span class="eyebrow">Appearance</span></div><div class="bd">${look}</div></div>` };
  const num = (l, k, note) => `<div class="fld"><label>${l}</label><input class="inp" type="number" step="any" value="${st[k] ?? ''}" data-c="set" data-k="${k}">${note ? `<span class="note">${note}</span>` : ''}</div>`;
  return { title: 'Settings', sub: 'Firm defaults, access and your data.',
    html: `<div class="stack"><div class="grid g2e"><div class="panel"><div class="hd"><span class="eyebrow">Firm</span></div><div class="bd" style="display:grid;gap:12px">
      <div class="fld"><label>Firm name</label><input class="inp" value="${esc(st.firm)}" data-c="${cl ? 'firmName' : 'set'}" data-k="firm"></div>
      ${num('Overhead rate (% of direct labor)', 'overhead', 'Used for project cost and profit. 150% means every $1 of salary carries $1.50 of overhead.')}
      ${num('Default expense markup (%)', 'markup')}${num('Payment terms (days)', 'terms')}
      ${num('Payroll: employee withholding (% of gross)', 'payWithhold', 'Estimate of federal + state + employee FICA withheld. Applies to new pay runs.')}${num('Payroll: employer tax (% of gross)', 'payEmployer', 'Employer FICA + unemployment estimate. Applies to new pay runs.')}${look}
    </div></div>
    <div class="panel"><div class="hd"><span class="eyebrow">Data</span></div><div class="bd" style="display:grid;gap:12px">
      <div class="note">${cl ? 'Your firm’s data lives in the cloud and syncs live to everyone on the team. Export a backup any time.' : 'Everything is stored in this browser only. Export a backup to move it to another computer, or sign in to share it with a team.'}</div>
      <div class="row"><button class="btn" data-a="export">Export backup</button><label class="btn">Import backup<input type="file" accept="application/json,.json" hidden data-c="import"></label></div>
      ${cl ? '<div class="row"><button class="btn danger" data-a="eraseAll">Erase all firm data…</button></div>' : '<div class="row"><button class="btn" data-a="resetDemo">Reload demo data</button><button class="btn danger" data-a="blank">Start with a blank office</button></div>'}
      <div class="note">${db.projects.length} projects · ${db.employees.length} people · ${db.time.length.toLocaleString()} time entries · ${db.invoices.length} invoices · ${db.bills.length} bills</div>
    </div></div></div>${typeof teamPanel === 'function' ? teamPanel() : ''}</div>` };
};

/* ---------- shell ---------- */
const NAV = [['', 'Overview'], ['dashboard', 'Dashboard'], ['projects', 'Projects'], ['tasks', 'Tasks'], ['', 'People'], ['schedule', 'Schedule'], ['time', 'Timesheets'], ['staff', 'Staff'], ['', 'Money'], ['billing', 'Billing'], ['expenses', 'Expenses'], ['clients', 'Clients'], ['reports', 'Reports'], ['', ''], ['settings', 'Settings']];
function route() { const [, v = 'dashboard', id] = location.hash.split('/'); return { v: V[v] && allowed(v) ? v : 'dashboard', id }; }
function render() {
  const { v, id } = route(), a = document.activeElement, fid = a && a.id, pos = a && a.selectionStart, t0 = today();
  const out = V[v](id), sec = v === 'project' ? 'projects' : v;
  const counts = { projects: [db.projects.filter(p => p.status === 'Active').length], tasks: [db.tasks.filter(k => k.status !== 'Done' && k.due < t0).length, 1], billing: [db.invoices.filter(x => x.status === 'Sent' && x.due < t0).length, 1], time: [new Set(db.time.filter(t => !t.approved && t.date < monday(t0)).map(t => t.empId + monday(t.date))).size, 1] };
  let nav = '', pend = null;
  for (const [k, l] of NAV) { if (!k) { pend = l; continue; } if (!allowed(k)) continue; if (pend !== null) { nav += `<div class="grp">${pend}</div>`; pend = null; } nav += `<a href="#/${k}" class="${sec === k ? 'on' : ''}">${l}${counts[k] && counts[k][0] ? `<span class="ct ${counts[k][1] ? 'hot' : ''}">${counts[k][0]}</span>` : ''}</a>`; }
  $('#nav').innerHTML = `<div class="brand"><div class="mark"></div><div><h1>Project Manager</h1><div class="tag">Apollo Development</div></div></div>` + nav + `<div class="foot">${sessionFoot ? sessionFoot() : esc(db.settings.firm)}</div>`;
  $('#top').innerHTML = `<div><h2>${out.title}</h2>${out.sub ? `<div class="sub">${out.sub}</div>` : ''}</div><div class="actions">${out.actions || ''}</div>`;
  $('#view').innerHTML = out.html;
  document.title = `${out.title.replace(/<[^>]+>/g, '')} · Project Manager · Apollo Development`;
  const th = themePref(); if (th === 'auto' || !th) document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = th;
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) { /* not a text input */ } } }
}
const commit = msg => { save(); render(); if (msg) toast(msg); };

/* ---------- modal + forms ---------- */
function modal(html, mount, wide) {
  $('#modal').innerHTML = `<div class="back" data-a="closeBack"><div class="dlg ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  if (mount) mount($('#modal .dlg'));
  const f = $('#modal input:not([type=hidden]), #modal select, #modal textarea'); if (f) f.focus();
}
const closeModal = () => { $('#modal').innerHTML = ''; document.body.classList.remove('printing'); };
function form({ title, fields, val = {}, save: onSave, del, saveLabel = 'Save' }) {
  const v = { ...val };
  const opts = f => (typeof f.opts === 'function' ? f.opts(v) : f.opts);
  const ctl = f => {
    const a = `name="${f.k}" id="f_${f.k}" ${f.req ? 'required' : ''}`;
    if (f.type === 'select') return `<select class="inp" ${a}>${opts(f).map(([x, l]) => opt(x, l, v[f.k])).join('')}</select>`;
    if (f.type === 'textarea') return `<textarea class="inp" rows="3" ${a}>${esc(v[f.k])}</textarea>`;
    if (f.type === 'check') return `<input type="checkbox" ${a} ${v[f.k] ? 'checked' : ''}>`;
    return `<input class="inp" type="${f.type || 'text'}" ${f.type === 'number' ? `step="${f.step || 'any'}"` : ''} ${a} value="${esc(v[f.k] ?? '')}">`;
  };
  modal(`<form><div class="dh"><h3>${esc(title)}</h3><button type="button" class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="db">${fields.map(f => `<div class="fld ${f.half ? 'half' : ''} ${f.type === 'check' ? 'chk' : ''}">${f.type === 'check' ? ctl(f) + `<label for="f_${f.k}">${esc(f.label)}</label>` : `<label for="f_${f.k}">${esc(f.label)}</label>` + ctl(f)}</div>`).join('')}</div>
    <div class="df"><div>${del ? '<button type="button" class="btn danger" id="fdel">Delete</button>' : ''}</div><div class="row"><button type="button" class="btn ghost" data-a="close">Cancel</button><button class="btn primary">${esc(saveLabel)}</button></div></div></form>`, root => {
    const read = () => fields.forEach(f => { const el = root.querySelector(`[name="${f.k}"]`); v[f.k] = f.type === 'check' ? el.checked : f.type === 'number' ? (parseFloat(el.value) || 0) : el.value; });
    root.addEventListener('change', () => { read(); fields.filter(f => typeof f.opts === 'function').forEach(f => { const el = root.querySelector(`[name="${f.k}"]`), o = opts(f); if (!o.some(([x]) => String(x) === String(v[f.k]))) v[f.k] = o[0]?.[0] ?? ''; el.innerHTML = o.map(([x, l]) => opt(x, l, v[f.k])).join(''); }); });
    root.querySelector('form').addEventListener('submit', e => { e.preventDefault(); read(); if (onSave(v) === false) return; closeModal(); commit('Saved'); });
    if (del) root.querySelector('#fdel').addEventListener('click', () => { if (confirm('Delete this? This cannot be undone.')) { del(); closeModal(); commit('Deleted'); } });
  });
}
const upsert = (arr, v, pre) => { if (v.id) Object.assign(arr.find(x => x.id === v.id), v); else arr.push({ ...v, id: pre + uid() }); };
const projOpts = (all) => db.projects.filter(p => all || p.status !== 'Closed').map(p => [p.id, p.num + ' — ' + p.name]);
const phaseOpts = v => { const p = proj(v.projId); return p ? p.phases.map(f => [f.id, f.name]) : OH.map(o => [o, o]); };
const empOpts = () => db.employees.filter(e => e.active).map(e => [e.id, e.name]);

/* ---------- actions ---------- */
const A = {
  go: d => { location.hash = d.h; },
  close: closeModal,
  closeBack: (d, el, e) => { if (e.target === el) closeModal(); },
  pf: d => { ui.pf = d.v; render(); },
  rep: d => { ui.rep = d.v; render(); },
  sched: d => { ui.sched = +d.v ? addDays(ui.sched, 7 * d.v) : monday(today()); render(); },
  tsWeek: d => { ui.tsWeek = addDays(ui.tsWeek, +d.v); ui.tsRows = []; render(); },
  tsOpen: d => { ui.tsEmp = d.e; ui.tsWeek = d.w; ui.tsRows = []; render(); window.scrollTo(0, 0); },
  tsAddRow: () => { const k = ui.tsAdd + '|' + $('#tsPhase').value; if (!ui.tsRows.includes(k)) ui.tsRows.push(k); render(); },
  approve: d => { const end = addDays(d.w, 6); db.time.forEach(t => { if (t.empId === d.e && t.date >= d.w && t.date <= end) t.approved = true; }); commit('Week approved'); },
  print: () => window.print(),

  editProject: d => {
    const p = d.id ? proj(d.id) : null;
    form({ title: p ? 'Edit project' : 'New project', val: p || { num: nextNum(), status: 'Active', type: 'fixed', start: today(), due: addDays(today(), 90), clientId: db.clients[0]?.id || '', pmId: db.employees[0]?.id || '' },
      fields: [{ k: 'num', label: 'Project #', half: 1, req: 1 }, { k: 'status', label: 'Status', type: 'select', opts: PSTAT.map(s => [s, s]), half: 1 }, { k: 'name', label: 'Project name', req: 1 },
        { k: 'clientId', label: 'Client', type: 'select', opts: [['', '— None —'], ...db.clients.map(c => [c.id, c.name])], half: 1 }, { k: 'pmId', label: 'Project manager', type: 'select', opts: empOpts(), half: 1 },
        { k: 'type', label: 'Billing', type: 'select', opts: [['fixed', 'Fixed fee (bill by % complete)'], ['tm', 'Hourly, not to exceed']], half: 1 }, { k: 'town', label: 'Location', half: 1 },
        { k: 'start', label: 'Start', type: 'date', half: 1 }, { k: 'due', label: 'Due', type: 'date', half: 1 }, { k: 'notes', label: 'Notes', type: 'textarea' }],
      save: v => { if (p) Object.assign(p, v); else { const np = { ...v, id: 'p' + uid(), phases: [] }; db.projects.push(np); setTimeout(() => { location.hash = '#/project/' + np.id; }); } },
      del: p && (() => { db.projects = db.projects.filter(x => x !== p); for (const k of ['time', 'expenses', 'invoices', 'tasks', 'plan']) db[k] = db[k].filter(x => x.projId !== p.id); db.bills.forEach(b => b.lines.forEach(l => { if (l.projId === p.id) { l.projId = ''; l.phaseId = ''; } })); location.hash = '#/projects'; }) });
  },
  editPhase: d => {
    const p = proj(d.p), f = d.f ? p.phases.find(x => x.id === d.f) : null, fixed = p.type === 'fixed';
    form({ title: f ? 'Edit phase' : 'Add phase', val: f || { fee: 0, hours: 0, pct: 0 },
      fields: [{ k: 'name', label: 'Phase name', req: 1 }, { k: 'fee', label: fixed ? 'Fee ($)' : 'Not-to-exceed ($)', type: 'number', half: 1 }, { k: 'hours', label: 'Budget hours', type: 'number', half: 1 }, ...(fixed ? [{ k: 'pct', label: '% complete', type: 'number', half: 1 }] : [])],
      save: v => { v.pct = Math.max(0, Math.min(100, v.pct || 0)); if (f) Object.assign(f, v); else p.phases.push({ ...v, id: 'f' + uid() }); },
      del: f && (() => { p.phases = p.phases.filter(x => x !== f); }) });
  },
  logTime: d => form({ title: 'Log time', saveLabel: 'Log time', val: { empId: ui.tsEmp || db.employees[0]?.id, date: today(), projId: d.p || projOpts()[0]?.[0] || '', hours: 1, phaseId: proj(d.p || projOpts()[0]?.[0])?.phases[0]?.id },
    fields: [{ k: 'empId', label: 'Person', type: 'select', opts: empOpts(), half: 1 }, { k: 'date', label: 'Date', type: 'date', half: 1, req: 1 }, { k: 'projId', label: 'Project', type: 'select', opts: [...projOpts(), ['', 'Overhead (non-billable)']] },
      { k: 'phaseId', label: 'Phase / code', type: 'select', opts: phaseOpts, half: 1 }, { k: 'hours', label: 'Hours', type: 'number', step: 0.25, half: 1 }, { k: 'note', label: 'Note' }],
    save: v => { if (v.hours <= 0) return false; db.time.push({ ...v, id: 't' + uid(), approved: false }); } }),
  editExpense: d => {
    const x = d.id ? db.expenses.find(e => e.id === d.id) : null, pid = d.p || projOpts()[0]?.[0] || '';
    if (x?.billId) return A.editBill({ id: x.billId });
    form({ title: x ? 'Edit expense' : 'Add expense', val: x || { projId: pid, phaseId: proj(pid)?.phases[0]?.id, date: today(), cat: CATS[0], markup: db.settings.markup, billable: true, amount: 0 },
      fields: [{ k: 'vendor', label: 'Vendor / description', req: 1 }, { k: 'projId', label: 'Project', type: 'select', opts: projOpts(true), half: 1 }, { k: 'phaseId', label: 'Phase', type: 'select', opts: phaseOpts, half: 1 },
        { k: 'date', label: 'Date', type: 'date', half: 1 }, { k: 'cat', label: 'Category', type: 'select', opts: CATS.map(c => [c, c]), half: 1 }, { k: 'amount', label: 'Cost ($)', type: 'number', half: 1 }, { k: 'markup', label: 'Markup (%)', type: 'number', half: 1 }, { k: 'billable', label: 'Bill this to the client', type: 'check' }],
      save: v => upsert(db.expenses, v, 'x'), del: x && (() => { db.expenses = db.expenses.filter(e => e !== x); }) });
  },
  editTask: d => {
    const k = d.id ? db.tasks.find(t => t.id === d.id) : null;
    form({ title: k ? 'Edit task' : 'New task', val: k || { projId: d.p || ui.tp || projOpts()[0]?.[0] || '', empId: ui.te || db.employees[0]?.id, due: addDays(today(), 7), status: 'To do', kind: 'Task' },
      fields: [{ k: 'title', label: 'Task', req: 1 }, { k: 'projId', label: 'Project', type: 'select', opts: [...projOpts(true), ['', 'General / office']], half: 1 }, { k: 'empId', label: 'Assigned to', type: 'select', opts: empOpts(), half: 1 },
        { k: 'due', label: 'Due', type: 'date', half: 1 }, { k: 'status', label: 'Status', type: 'select', opts: TSTAT.map(s => [s, s]), half: 1 }, { k: 'kind', label: 'Type', type: 'select', opts: ['Task', 'Deadline', 'Permit'].map(s => [s, s]), half: 1 }],
      save: v => upsert(db.tasks, v, 'k'), del: k && (() => { db.tasks = db.tasks.filter(t => t !== k); }) });
  },
  editEmp: d => {
    const e = d.id ? emp(d.id) : null;
    form({ title: e ? 'Edit person' : 'Add person', val: e || { cost: 40, bill: 120, cap: 40, target: 80, active: true },
      fields: [{ k: 'name', label: 'Name', req: 1, half: 1 }, { k: 'title', label: 'Title', half: 1 }, { k: 'cost', label: 'Cost rate ($/h)', type: 'number', half: 1 }, { k: 'bill', label: 'Billing rate ($/h)', type: 'number', half: 1 },
        { k: 'cap', label: 'Weekly capacity (h)', type: 'number', half: 1 }, { k: 'target', label: 'Target utilization (%)', type: 'number', half: 1 }, { k: 'active', label: 'Active employee', type: 'check' }],
      save: v => upsert(db.employees, v, 'e'),
      del: e && !db.time.some(t => t.empId === e.id) && (() => { db.employees = db.employees.filter(x => x !== e); db.plan = db.plan.filter(a => a.empId !== e.id); }) });
  },
  editClient: d => {
    const c = d.id ? client(d.id) : null;
    form({ title: c ? 'Edit client' : 'Add client', val: c || {}, fields: [{ k: 'name', label: 'Client name', req: 1 }, { k: 'contact', label: 'Contact', half: 1 }, { k: 'phone', label: 'Phone', half: 1 }, { k: 'email', label: 'Email', type: 'email' }],
      save: v => upsert(db.clients, v, 'c'), del: c && !db.projects.some(p => p.clientId === c.id) && (() => { db.clients = db.clients.filter(x => x !== c); }) });
  },

  editPlan: d => {
    const e = emp(d.e), rows = db.plan.filter(a => a.empId === d.e && a.week === d.w).map(a => ({ projId: a.projId, hours: a.hours }));
    if (!rows.length) rows.push({ projId: '', hours: 0 });
    const body = () => rows.map((r, i) => `<div class="row" style="margin-bottom:8px;flex-wrap:nowrap"><select class="inp" style="flex:1" data-pi="${i}"><option value="">— Choose project —</option>${db.projects.filter(p => p.status === 'Active' || p.status === 'Proposal' || p.id === r.projId).map(p => opt(p.id, p.num + ' — ' + p.name, r.projId)).join('')}</select><input class="inp" type="number" min="0" step="1" style="width:80px" value="${r.hours || ''}" placeholder="h" data-ph="${i}"><button type="button" class="x" data-prm="${i}" aria-label="Remove">×</button></div>`).join('');
    modal(`<form><div class="dh"><h3>${esc(e.name.split(',')[0])} · week of ${fd(d.w)}</h3><button type="button" class="x" data-a="close" aria-label="Close">×</button></div>
      <div class="db one"><div id="prows">${body()}</div><div class="spread"><button type="button" class="btn sm" id="padd">+ Add project</button><span class="mono sm" id="ptot"></span></div>
      <div class="fld" style="margin-top:14px"><label>Repeat for the following weeks</label><select class="inp" id="prep">${[0, 1, 2, 3, 5, 7].map(n => opt(n, n ? `This week + next ${n}` : 'This week only')).join('')}</select></div></div>
      <div class="df"><span></span><div class="row"><button type="button" class="btn ghost" data-a="close">Cancel</button><button class="btn primary">Save plan</button></div></div></form>`, root => {
      const tot = () => { const h = sum(rows, r => r.hours); $('#ptot', root).innerHTML = `${hr(h)} of ${e.cap} h${h > e.cap ? ' — <span class="neg">over capacity</span>' : ''}`; };
      const sync = () => { $$('[data-pi]', root).forEach(el => rows[el.dataset.pi].projId = el.value); $$('[data-ph]', root).forEach(el => rows[el.dataset.ph].hours = parseFloat(el.value) || 0); tot(); };
      root.addEventListener('input', sync);
      root.addEventListener('click', ev => { const rm = ev.target.closest('[data-prm]'); if (rm) { sync(); rows.splice(rm.dataset.prm, 1); $('#prows', root).innerHTML = body(); tot(); } if (ev.target.id === 'padd') { sync(); rows.push({ projId: '', hours: 0 }); $('#prows', root).innerHTML = body(); } });
      root.querySelector('form').addEventListener('submit', ev => { ev.preventDefault(); sync(); const n = +$('#prep', root).value;
        for (let i = 0; i <= n; i++) { const w = addDays(d.w, 7 * i); db.plan = db.plan.filter(a => !(a.empId === d.e && a.week === w)); rows.filter(r => r.projId && r.hours > 0).forEach(r => db.plan.push({ id: 'a' + uid(), empId: d.e, projId: r.projId, week: w, hours: r.hours })); }
        closeModal(); commit('Plan saved'); });
      tot();
    });
  },

  newInvoice: d => {
    const p = proj(d.p), s = stats()[d.p], lines = Object.values(s.ph).filter(b => b.wip > 0.5).map(b => ({ phaseId: b.f.id, desc: b.f.name, amount: Math.round(b.wip * 100) / 100, wip: b.wip }));
    if (!lines.length) return toast('Nothing to bill — update % complete or log time first.');
    modal(`<form><div class="dh"><h3>New invoice · ${esc(p.num)}</h3><button type="button" class="x" data-a="close" aria-label="Close">×</button></div>
      <div class="db one"><div class="note" style="margin-bottom:10px">${p.type === 'fixed' ? 'Amounts are fee × % complete, less what has already been invoiced.' : 'Amounts are unbilled hours at billing rates plus reimbursables.'} Adjust any line before saving.</div>
      <table><thead><tr><th style="padding-left:0">Phase</th><th class="r">Unbilled</th><th class="r" style="padding-right:0">Bill now</th></tr></thead><tbody>${lines.map((l, i) => `<tr><td style="padding-left:0">${esc(l.desc)}</td><td class="r">${$m(l.wip)}</td><td class="r" style="padding-right:0"><input class="inp sm" type="number" step="0.01" style="width:120px;text-align:right" value="${l.amount}" data-li="${i}"></td></tr>`).join('')}</tbody>
      <tfoot><tr><td style="padding-left:0" colspan="2">Invoice total</td><td class="r" id="itot" style="padding-right:0"></td></tr></tfoot></table>
      <div class="row" style="margin-top:14px"><div class="fld" style="flex:1"><label>Invoice date</label><input class="inp" type="date" id="idate" value="${today()}"></div><div class="fld" style="flex:1"><label>Terms (days)</label><input class="inp" type="number" id="iterms" value="${db.settings.terms}"></div></div></div>
      <div class="df"><span></span><div class="row"><button type="button" class="btn ghost" data-a="close">Cancel</button><button class="btn primary">Save draft</button></div></div></form>`, root => {
      const upd = () => { $$('[data-li]', root).forEach(el => lines[el.dataset.li].amount = parseFloat(el.value) || 0); $('#itot', root).textContent = $m(sum(lines, l => l.amount)); };
      root.addEventListener('input', upd); upd();
      root.querySelector('form').addEventListener('submit', ev => { ev.preventDefault(); upd(); const date = $('#idate', root).value || today();
        const v = { id: 'i' + uid(), num: String(nextInvNum()), projId: p.id, date, due: addDays(date, +$('#iterms', root).value || 0), status: 'Draft', paidDate: '', lines: lines.filter(l => l.amount).map(({ phaseId, desc, amount }) => ({ phaseId, desc, amount })) };
        if (!v.lines.length) return; db.invoices.push(v); save(); render(); A.viewInvoice({ id: v.id }); toast('Draft invoice created'); });
    }, true);
  },
  viewInvoice: d => {
    const v = db.invoices.find(x => x.id === d.id), p = proj(v.projId), c = client(p?.clientId);
    modal(`<div class="dh"><span class="eyebrow">Invoice</span><button type="button" class="x" data-a="close" aria-label="Close">×</button></div><div class="db one"><div class="inv">
      <div class="spread"><div><h3>${esc(db.settings.firm)}</h3><div class="note">Professional services invoice</div></div><div style="text-align:right"><div class="mono nm">#${esc(v.num)}</div>${invBadge(v)}</div></div>
      <div class="meta"><div><div class="eyebrow">Bill to</div><div class="nm">${esc(c?.name || '—')}</div><div>${esc(c?.contact || '')}</div><div class="sm">${esc(c?.email || '')}</div></div>
        <div><div class="eyebrow">Project</div><div class="nm">${esc(p?.name || '')}</div><div class="sm mono">${esc(p?.num || '')} · ${esc(p?.town || '')}</div><div class="sm">Dated ${fdy(v.date)} · Due ${fdy(v.due)}${v.paidDate ? ' · Paid ' + fdy(v.paidDate) : ''}</div></div></div>
      <table><thead><tr><th style="padding-left:0">Description</th><th class="r" style="padding-right:0">Amount</th></tr></thead><tbody>${v.lines.map(l => `<tr><td style="padding-left:0">${esc(l.desc)}</td><td class="r" style="padding-right:0">${usd.format(l.amount)}</td></tr>`).join('')}</tbody></table>
      <div class="tot" style="padding-right:0"><span>Total due</span><span>${usd.format(invTotal(v))}</span></div></div></div>
      <div class="df"><button class="btn danger" data-a="invDelete" data-id="${v.id}">Delete</button><div class="row"><button class="btn" data-a="invPrint">Print / PDF</button>${v.status === 'Draft' ? `<button class="btn primary" data-a="invStatus" data-id="${v.id}" data-v="Sent">Mark sent</button>` : v.status === 'Sent' ? `<button class="btn primary" data-a="invStatus" data-id="${v.id}" data-v="Paid">Mark paid</button>` : `<button class="btn" data-a="invStatus" data-id="${v.id}" data-v="Sent">Reopen</button>`}</div></div>`, null, true);
  },
  invStatus: d => { const v = db.invoices.find(x => x.id === d.id); v.status = d.v; v.paidDate = d.v === 'Paid' ? today() : ''; closeModal(); commit(`Invoice #${v.num} marked ${d.v.toLowerCase()}`); },
  invDelete: d => { if (!confirm('Delete this invoice? Its amounts go back to unbilled WIP.')) return; db.invoices = db.invoices.filter(x => x.id !== d.id); closeModal(); commit('Invoice deleted'); },
  invPrint: () => { document.body.classList.add('printing'); window.print(); document.body.classList.remove('printing'); },

  csv: () => { const [name, fn] = REPORTS[ui.rep], r = fn(); const q = c => '"' + String(c).replace(/"/g, '""') + '"';
    download(name.toLowerCase().replace(/\W+/g, '-') + '-' + today() + '.csv', [r.cols.map(c => q(c[0])).join(','), ...r.rows.map(row => row.map(q).join(','))].join('\r\n'), 'text/csv'); },
  export: () => download('project-manager-backup-' + today() + '.json', JSON.stringify(db, null, 1), 'application/json'),
  resetDemo: () => { if (confirm('Replace everything with fresh demo data?')) { db = makeSeed(); ensure(true); commit('Demo data loaded'); } },
  blank: () => { if (!confirm('Erase all data and start with an empty office? Export a backup first if you want to keep anything.')) return;
    db = { v: 1, settings: { ...db.settings, nextInvoice: 1001 }, employees: [], clients: [], projects: [], time: [], expenses: [], invoices: [], tasks: [], plan: [], accounts: [], vendors: [], bills: [], payruns: [], journals: [] }; ensure(true); commit('Blank office ready — add your people and clients first'); },
};
// never reuse an invoice number, even if two people bill at once
const nextInvNum = () => { const n = Math.max(db.settings.nextInvoice || 1001, ...db.invoices.map(x => (parseInt(x.num, 10) || 0) + 1)); db.settings.nextInvoice = n + 1; return n; };
const nextNum = () => { const yy = String(new Date().getFullYear()).slice(2), n = Math.max(0, ...db.projects.map(p => (p.num.startsWith(yy + '-') ? parseInt(p.num.slice(3), 10) || 0 : 0))); return yy + '-' + String(n + 1).padStart(3, '0'); };
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

/* ---------- change / input handlers ---------- */
const C = {
  tsEmp: el => { ui.tsEmp = el.value; ui.tsRows = []; render(); },
  tsAdd: el => { ui.tsAdd = el.value; render(); },
  tp: el => { ui.tp = el.value; render(); }, te: el => { ui.te = el.value; render(); },
  repW: el => { ui.repW = +el.value; render(); },
  pct: el => { const f = proj(el.dataset.p).phases.find(x => x.id === el.dataset.f); f.pct = Math.max(0, Math.min(100, parseFloat(el.value) || 0)); commit(); },
  set: el => { const k = el.dataset.k; if (k === 'theme' && typeof cloud !== 'undefined' && cloud.on) { try { localStorage.setItem('apollo-pm-theme', el.value); } catch (e) { /* ignore */ } return render(); } db.settings[k] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value; commit('Saved'); },
  ts: el => { // timesheet cell: replace that person/row/day, then patch totals in place so tabbing keeps focus
    const [pid, f] = el.dataset.k.split('|'), d = el.dataset.d, h = Math.max(0, Math.min(24, parseFloat(el.value) || 0));
    db.time = db.time.filter(t => !(t.empId === ui.tsEmp && t.date === d && tsKey(t) === el.dataset.k));
    if (h) db.time.push({ id: 't' + uid(), empId: ui.tsEmp, projId: pid, phaseId: f, date: d, hours: h, note: '', approved: false });
    el.value = h || ''; if (!ui.tsRows.includes(el.dataset.k)) ui.tsRows.push(el.dataset.k); save();
    const end = addDays(ui.tsWeek, 6), ents = db.time.filter(t => t.empId === ui.tsEmp && t.date >= ui.tsWeek && t.date <= end);
    $$('[data-rt]').forEach(c => c.textContent = hr(sum(ents.filter(t => tsKey(t) === c.dataset.rt), t => t.hours)));
    $$('[data-dt]').forEach(c => c.textContent = hr(sum(ents.filter(t => t.date === c.dataset.dt), t => t.hours)));
    $('#tsTot').textContent = `${hr(sum(ents, t => t.hours))} / ${emp(ui.tsEmp)?.cap || 40}`;
  },
  import: el => { const file = el.files[0]; if (!file) return; file.text().then(txt => { try { const j = JSON.parse(txt); if (!j.projects || !j.employees || !j.settings) throw 0; db = j; ensure(true); commit('Backup imported'); } catch (e) { toast('That file is not a Project Manager backup.'); } }); },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  if (e.target.closest('input,select,textarea,label') && !e.target.closest('[data-a]').matches('input,select,textarea,label,button')) return;
  const inner = e.target.closest('a[href]'); if (inner && el !== inner && el.contains(inner)) return;
  A[el.dataset.a]?.(el.dataset, el, e);
});
document.addEventListener('change', e => { const el = e.target.closest('[data-c]'); if (el) C[el.dataset.c]?.(el); });
document.addEventListener('input', e => { if (e.target.dataset.i === 'pq') { ui.pq = e.target.value; render(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal').innerHTML) closeModal(); });
document.addEventListener('dragstart', e => { const c = e.target.closest?.('[data-drag]'); if (c) e.dataTransfer.setData('text/plain', c.dataset.drag); });
document.addEventListener('dragover', e => { const c = e.target.closest?.('[data-drop]'); if (c) { e.preventDefault(); c.classList.add('over'); } });
document.addEventListener('dragleave', e => { const c = e.target.closest?.('[data-drop]'); if (c && !c.contains(e.relatedTarget)) c.classList.remove('over'); });
document.addEventListener('drop', e => { const c = e.target.closest?.('[data-drop]'); if (!c) return; e.preventDefault(); const k = db.tasks.find(t => t.id === e.dataTransfer.getData('text/plain')); if (k && k.status !== c.dataset.drop) { k.status = c.dataset.drop; commit(); } else c.classList.remove('over'); });
window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0, 0); });

