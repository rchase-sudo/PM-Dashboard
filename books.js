'use strict';
/* Books — lightweight accounting on top of the project data.
   The general ledger is DERIVED from source documents (invoices, receipts, bills, bill payments, payroll runs,
   direct expenses, manual journal entries), so it can never drift out of sync with the project side.
   Not a tax or payroll filing system: estimates and bookkeeping only. */
let lmemo = null;
function bookReset() { lmemo = null; }

const A_ = c => 'a' + c;
const ACC = { cash: A_(1000), ar: A_(1100), ap: A_(2000), pl: A_(2100), rev: A_(4000), sal: A_(5000), ptx: A_(5100), sub: A_(5200), reimb: A_(5300), other: A_(6900) };
const EXP_ACCT = { Subconsultant: ACC.sub, 'Permit fee': ACC.reimb, Mileage: ACC.reimb, Printing: ACC.reimb, Equipment: ACC.reimb, Travel: ACC.reimb, Other: ACC.other };
const TYPES = [['asset', 'Assets'], ['liability', 'Liabilities'], ['equity', 'Equity'], ['revenue', 'Revenue'], ['expense', 'Expenses']];
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

function defaultAccounts() {
  return [
    ['1000', 'Operating Cash', 'asset'], ['1100', 'Accounts Receivable', 'asset'], ['1500', 'Equipment & Computers', 'asset'],
    ['2000', 'Accounts Payable', 'liability'], ['2100', 'Payroll Liabilities', 'liability'],
    ['3000', "Owner's Equity", 'equity'], ['3010', 'Opening Balance Equity', 'equity'],
    ['4000', 'Professional Services Revenue', 'revenue'], ['4900', 'Other Income', 'revenue'],
    ['5000', 'Salaries & Wages', 'expense'], ['5100', 'Payroll Taxes', 'expense'], ['5200', 'Subconsultants', 'expense'], ['5300', 'Reimbursable & Project Costs', 'expense'],
    ['6000', 'Rent & Utilities', 'expense'], ['6100', 'Software & Licenses', 'expense'], ['6200', 'Insurance', 'expense'], ['6300', 'Office Supplies', 'expense'],
    ['6400', 'Marketing', 'expense'], ['6500', 'Legal & Accounting', 'expense'], ['6900', 'Other Expenses', 'expense'],
  ].map(([code, name, type]) => ({ id: A_(code), code, name, type, system: ['1000', '1100', '2000', '2100', '4000', '5000', '5100', '5200', '5300', '6900'].includes(code) }));
}

/* ---------- lookups ---------- */
const acct = id => (db.accounts || []).find(a => a.id === id);
const acctLabel = id => { const a = acct(id); return a ? a.code + ' ' + a.name : '(deleted account)'; };
const nat = a => (a.type === 'asset' || a.type === 'expense') ? 1 : -1;
const vend = id => db.vendors.find(v => v.id === id);
const billTotal = b => sum(b.lines, l => l.amount);
const runTot = (r, k) => sum(r.lines, l => l[k]);
const payRates = () => ({ wh: db.settings.payWithhold ?? 22, er: db.settings.payEmployer ?? 8.65 });
const expAccts = () => db.accounts.filter(a => a.type === 'expense').sort((a, b) => a.code < b.code ? -1 : 1);
const acctUsed = id => db.bills.some(b => b.lines.some(l => l.accountId === id)) || db.journals.some(j => j.lines.some(l => l.accountId === id)) || db.vendors.some(v => v.defAcct === id);

/* ---------- the derived ledger ---------- */
function ledger() {
  if (lmemo) return lmemo;
  const L = []; let ord = 0;
  const add = (date, src, ref, memo, lines, link) => { const ls = lines.filter(l => l.a && ((l.dr || 0) || (l.cr || 0))); if (ls.length && date) L.push({ date, src, ref, memo, lines: ls, link, ord: ord++ }); };
  for (const v of db.invoices) {
    if (v.status === 'Draft') continue;
    const p = proj(v.projId), t = invTotal(v), nm = (p ? p.num + ' · ' : '') + (client(p?.clientId)?.name || '');
    add(v.date, 'Invoice', '#' + v.num, nm, [{ a: ACC.ar, dr: t }, { a: ACC.rev, cr: t }], { t: 'invoice', id: v.id });
    if (v.status === 'Paid') add(v.paidDate || v.date, 'Receipt', '#' + v.num, nm, [{ a: ACC.cash, dr: t }, { a: ACC.ar, cr: t }], { t: 'invoice', id: v.id });
  }
  // expenses entered directly are treated as paid from cash that day; vendor bills (billId) go through payables instead
  for (const x of db.expenses) { if (x.billId) continue; add(x.date, 'Expense', x.cat, x.vendor, [{ a: EXP_ACCT[x.cat] || ACC.other, dr: x.amount }, { a: ACC.cash, cr: x.amount }], { t: 'expense', id: x.id }); }
  for (const b of db.bills) {
    const t = billTotal(b), vn = vend(b.vendorId)?.name || 'Vendor';
    add(b.date, 'Bill', '#' + b.num, vn, [...b.lines.map(l => ({ a: l.accountId, dr: l.amount })), { a: ACC.ap, cr: t }], { t: 'bill', id: b.id });
    if (b.status === 'Paid') add(b.paidDate || b.date, 'Payment', '#' + b.num, vn, [{ a: ACC.ap, dr: t }, { a: ACC.cash, cr: t }], { t: 'bill', id: b.id });
  }
  for (const r of db.payruns) {
    if (r.status !== 'Paid') continue;
    const g = runTot(r, 'gross'), er = runTot(r, 'er'), wh = runTot(r, 'wh'), n = runTot(r, 'net');
    add(r.payDate, 'Payroll', r.num, fd(r.start) + ' – ' + fd(r.end), [{ a: ACC.sal, dr: g }, { a: ACC.ptx, dr: er }, { a: ACC.pl, cr: r2(wh + er) }, { a: ACC.cash, cr: n }], { t: 'payrun', id: r.id });
  }
  for (const j of db.journals) add(j.date, 'Journal', j.num, j.memo, j.lines.map(l => ({ a: l.accountId, dr: l.debit, cr: l.credit })), { t: 'journal', id: j.id });
  L.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.ord - b.ord);
  return lmemo = L;
}
function sums(to, from) {
  const m = {};
  for (const e of ledger()) { if (e.date > to || (from && e.date < from)) continue; for (const l of e.lines) { const s = m[l.a] || (m[l.a] = { dr: 0, cr: 0 }); s.dr += l.dr || 0; s.cr += l.cr || 0; } }
  return m;
}
const balOf = (a, s) => { const x = s[a.id]; return x ? nat(a) * (x.dr - x.cr) : 0; };
const byCode = (a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
function statements(from, to) {
  const pl = sums(to, from), all = sums(to), A = db.accounts.slice().sort(byCode);
  const rev = A.filter(a => a.type === 'revenue').map(a => [a, balOf(a, pl)]).filter(r => Math.abs(r[1]) > 0.004);
  const exp = A.filter(a => a.type === 'expense').map(a => [a, balOf(a, pl)]).filter(r => Math.abs(r[1]) > 0.004);
  const tr = sum(rev, r => r[1]), te = sum(exp, r => r[1]);
  const grp = t => A.filter(a => a.type === t).map(a => [a, balOf(a, all)]).filter(r => Math.abs(r[1]) > 0.004);
  const assets = grp('asset'), liab = grp('liability'), eq = grp('equity');
  let earn = 0; for (const a of A) if (a.type === 'revenue' || a.type === 'expense') earn += (a.type === 'revenue' ? 1 : -1) * balOf(a, all);
  const ta = sum(assets, r => r[1]), tl = sum(liab, r => r[1]), tq = sum(eq, r => r[1]) + earn;
  const tb = A.map(a => { const x = all[a.id] || { dr: 0, cr: 0 }, n = x.dr - x.cr; return [a, n > 0 ? n : 0, n < 0 ? -n : 0]; }).filter(r => r[1] || r[2]);
  return { rev, exp, tr, te, net: tr - te, assets, liab, eq, earn, ta, tl, tq, tb, tdr: sum(tb, r => r[1]), tcr: sum(tb, r => r[2]) };
}
const cashBal = () => { const a = acct(ACC.cash); return a ? balOf(a, sums(today())) : 0; };
const acctBal = id => { const a = acct(id); return a ? balOf(a, sums(today())) : 0; };
function periodRange(k) {
  const t = today(), d = D(t), y = d.getFullYear(), m = d.getMonth(), ymd = (yy, mm, dd) => iso(new Date(yy, mm, dd, 12));
  switch (k) {
    case 'month': return [ymd(y, m, 1), t];
    case 'last': return [ymd(y, m - 1, 1), ymd(y, m, 0)];
    case 'qtr': return [ymd(y, Math.floor(m / 3) * 3, 1), t];
    case 'ytd': return [ymd(y, 0, 1), t];
    case '12': return [addDays(t, -364), t];
    default: return ['0000-01-01', t];
  }
}
const PERIODS = [['month', 'This month'], ['last', 'Last month'], ['qtr', 'This quarter'], ['ytd', 'Year to date'], ['12', 'Last 12 months'], ['all', 'All time']];

/* ---------- dashboard / alert hooks ---------- */
function bookKpi() {
  if (!allowed('ledger') || !db.accounts.length) return '';
  const ap = acctBal(ACC.ap);
  return `<div class="kpi"><div class="l">Cash</div><div class="v">${$k(cashBal())}</div><div class="s">${$k(ap)} payables</div></div>`;
}
function bookAlerts() {
  if (!allowed('payables')) return [];
  const t0 = today(), out = [], open = db.bills.filter(b => b.status === 'Open'), od = open.filter(b => b.due < t0), soon = open.filter(b => b.due >= t0 && b.due <= addDays(t0, 7));
  if (od.length) out.push({ t: 'bad', h: '#/payables', a: `${od.length} bill${od.length > 1 ? 's' : ''} overdue`, d: `${$m(sum(od, billTotal))} past due to vendors` });
  if (soon.length) out.push({ t: '', h: '#/payables', a: `${soon.length} bill${soon.length > 1 ? 's' : ''} due this week`, d: `${$m(sum(soon, billTotal))} coming due` });
  const dr = db.payruns.filter(r => r.status === 'Draft').sort((a, b) => a.payDate < b.payDate ? -1 : 1)[0];
  if (dr && dr.payDate <= addDays(t0, 7)) out.push({ t: 'info', h: '#/payroll', a: `Payroll ${dr.payDate < t0 ? 'was due' : 'is due'} ${fd(dr.payDate)}`, d: `${$m(runTot(dr, 'gross'))} gross · ${dr.lines.length} people` });
  return out;
}

/* ---------- Ledger ---------- */
V.ledger = () => {
  ui.lt ??= 'coa'; ui.la ??= ''; ui.lq ??= '';
  const s = sums(today());
  const head = `<div class="seg"><button class="${ui.lt === 'coa' ? 'on' : ''}" data-a="lt" data-v="coa">Chart of accounts</button><button class="${ui.lt === 'gl' ? 'on' : ''}" data-a="lt" data-v="gl">General ledger</button></div>`;
  const acts = `${head}<button class="btn" data-a="editAccount">+ Account</button><button class="btn primary" data-a="editJournal">+ Journal entry</button>`;
  if (ui.lt === 'coa') {
    return { title: 'Ledger', sub: 'Every dollar in the firm, derived live from invoices, bills, payroll and journal entries.', actions: acts,
      html: `<div class="stack">${TYPES.map(([t, label]) => { const A = db.accounts.filter(a => a.type === t).sort(byCode); if (!A.length) return '';
        return `<div class="panel"><div class="hd"><span class="eyebrow">${label}</span><span class="num nm">${$m(sum(A, a => balOf(a, s)))}</span></div><div class="bd flush"><table><tbody>
          ${A.map(a => `<tr class="click" data-a="glAcct" data-id="${a.id}"><td class="num" style="width:80px">${esc(a.code)}</td><td class="nm">${esc(a.name)}</td><td class="r">${$m(balOf(a, s))}</td><td class="r" style="width:70px"><button class="btn sm ghost" data-a="editAccount" data-id="${a.id}">Edit</button></td></tr>`).join('')}</tbody></table></div></div>`; }).join('') || '<div class="panel"><div class="empty">No accounts yet.</div></div>'}</div>` };
  }
  const q = ui.lq.toLowerCase(), rows = [];
  for (const e of ledger()) for (const l of e.lines) { if (ui.la && l.a !== ui.la) continue; if (q && !(e.memo + e.ref + e.src + acctLabel(l.a)).toLowerCase().includes(q)) continue; rows.push({ e, l }); }
  const a0 = acct(ui.la); let run = 0; if (a0) rows.forEach(r => { run += nat(a0) * ((r.l.dr || 0) - (r.l.cr || 0)); r.run = run; });
  const show = rows.slice().reverse().slice(0, 400);
  return { title: 'Ledger', sub: a0 ? `${esc(a0.code)} ${esc(a0.name)} · balance ${$m(run)}` : 'All transactions', actions: acts,
    html: `<div class="stack"><div class="row"><select class="inp sm" data-c="la"><option value="">All accounts</option>${db.accounts.slice().sort(byCode).map(a => opt(a.id, a.code + ' ' + a.name, ui.la)).join('')}</select><input class="inp sm" id="lq" data-i="lq" placeholder="Search memo, vendor, ref…" value="${esc(ui.lq)}"><span class="note">${rows.length} lines${rows.length > 400 ? ' — showing the latest 400' : ''}</span></div>
    <div class="panel"><div class="bd flush"><table><thead><tr><th>Date</th><th>Source</th><th>Ref</th><th>Memo</th>${a0 ? '' : '<th>Account</th>'}<th class="r">Debit</th><th class="r">Credit</th>${a0 ? '<th class="r">Balance</th>' : ''}</tr></thead><tbody>
    ${show.map(({ e, l, run: rr }) => `<tr class="click" data-a="openSrc" data-t="${e.link.t}" data-id="${e.link.id}"><td class="num">${fd(e.date)}</td><td>${badge(e.src, e.src === 'Journal' ? 'vio' : '')}</td><td class="num">${esc(e.ref)}</td><td>${esc(e.memo)}</td>${a0 ? '' : `<td class="sm">${esc(acctLabel(l.a))}</td>`}<td class="r">${l.dr ? $m(l.dr) : ''}</td><td class="r">${l.cr ? $m(l.cr) : ''}</td>${a0 ? `<td class="r">${$m(rr)}</td>` : ''}</tr>`).join('') || `<tr><td colspan="8" class="empty">No transactions.</td></tr>`}</tbody></table></div></div></div>` };
};
document.addEventListener('input', e => { if (e.target.dataset.i === 'lq') { ui.lq = e.target.value; render(); } });
C.la = el => { ui.la = el.value; render(); };
A.lt = d => { ui.lt = d.v; render(); };
A.glAcct = d => { ui.la = d.id; ui.lt = 'gl'; ui.lq = ''; if (route().v !== 'ledger') location.hash = '#/ledger'; else render(); };
A.openSrc = d => ({ invoice: () => A.viewInvoice({ id: d.id }), bill: () => A.editBill({ id: d.id }), payrun: () => A.viewRun({ id: d.id }), journal: () => A.editJournal({ id: d.id }), expense: () => A.editExpense({ id: d.id }) })[d.t]?.();

A.editAccount = d => {
  const a = d.id ? acct(d.id) : null;
  form({ title: a ? 'Edit account' : 'New account', val: a || { type: 'expense', code: '' },
    fields: [{ k: 'code', label: 'Account #', half: 1, req: 1 }, { k: 'name', label: 'Name', half: 1, req: 1 }, ...(a?.system ? [] : [{ k: 'type', label: 'Type', type: 'select', opts: TYPES.map(([v, l]) => [v, l.replace(/s$/, '')]) }])],
    save: v => { v.code = String(v.code).trim(); if (db.accounts.some(x => x.code === v.code && x.id !== v.id)) { toast('That account number is already used.'); return false; } if (a) Object.assign(a, v); else db.accounts.push({ ...v, id: A_(v.code) + (db.accounts.some(x => x.id === A_(v.code)) ? uid() : ''), system: false }); },
    del: a && !a.system && !acctUsed(a.id) && (() => { db.accounts = db.accounts.filter(x => x !== a); }) });
};

A.editJournal = d => {
  const j0 = d.id ? db.journals.find(x => x.id === d.id) : null;
  const j = j0 ? JSON.parse(JSON.stringify(j0)) : { date: today(), memo: '', lines: [{ accountId: '', debit: 0, credit: 0 }, { accountId: '', debit: 0, credit: 0 }] };
  const sel = id => `<option value="">— Account —</option>${db.accounts.slice().sort(byCode).map(a => opt(a.id, a.code + ' ' + a.name, id)).join('')}`;
  const body = () => j.lines.map((l, i) => `<div class="row" style="margin-bottom:8px;flex-wrap:nowrap"><select class="inp" style="flex:1" data-ja="${i}">${sel(l.accountId)}</select><input class="inp" type="number" step="0.01" min="0" style="width:110px" placeholder="Debit" value="${l.debit || ''}" data-jd="${i}"><input class="inp" type="number" step="0.01" min="0" style="width:110px" placeholder="Credit" value="${l.credit || ''}" data-jc="${i}"><button type="button" class="x" data-jr="${i}" aria-label="Remove">×</button></div>`).join('');
  modal(`<form><div class="dh"><h3>${j0 ? 'Journal entry ' + esc(j0.num || '') : 'New journal entry'}</h3><button type="button" class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="db one"><div class="row" style="margin-bottom:12px"><div class="fld" style="width:150px"><label>Date</label><input class="inp" type="date" id="jdate" value="${j.date}" required></div><div class="fld" style="flex:1"><label>Memo</label><input class="inp" id="jmemo" value="${esc(j.memo)}" placeholder="What is this entry for?"></div></div>
    <div id="jrows">${body()}</div><div class="spread"><button type="button" class="btn sm" id="jadd">+ Line</button><span class="mono sm" id="jtot"></span></div></div>
    <div class="df"><div>${j0 ? '<button type="button" class="btn danger" id="jdel">Delete</button>' : ''}</div><div class="row"><button type="button" class="btn ghost" data-a="close">Cancel</button><button class="btn primary" id="jsave">Post entry</button></div></div></form>`, root => {
    const sync = () => { j.date = $('#jdate', root).value; j.memo = $('#jmemo', root).value; $$('[data-ja]', root).forEach(e => j.lines[e.dataset.ja].accountId = e.value); $$('[data-jd]', root).forEach(e => j.lines[e.dataset.jd].debit = parseFloat(e.value) || 0); $$('[data-jc]', root).forEach(e => j.lines[e.dataset.jc].credit = parseFloat(e.value) || 0);
      const dr = sum(j.lines, l => l.debit), cr = sum(j.lines, l => l.credit), ok = Math.abs(dr - cr) < 0.005 && dr > 0 && j.lines.filter(l => l.accountId && (l.debit || l.credit)).length >= 2;
      $('#jtot', root).innerHTML = `Debits ${$m(dr)} · Credits ${$m(cr)}${Math.abs(dr - cr) >= 0.005 ? ` · <span class="neg">out of balance by ${usd.format(Math.abs(dr - cr))}</span>` : dr ? ' · <span class="pos">balanced</span>' : ''}`; $('#jsave', root).disabled = !ok; };
    root.addEventListener('input', sync); root.addEventListener('change', sync);
    root.addEventListener('click', ev => { const rm = ev.target.closest('[data-jr]'); if (rm) { sync(); j.lines.splice(rm.dataset.jr, 1); if (j.lines.length < 2) j.lines.push({ accountId: '', debit: 0, credit: 0 }); $('#jrows', root).innerHTML = body(); sync(); } if (ev.target.id === 'jadd') { sync(); j.lines.push({ accountId: '', debit: 0, credit: 0 }); $('#jrows', root).innerHTML = body(); } });
    root.querySelector('form').addEventListener('submit', ev => { ev.preventDefault(); sync(); const lines = j.lines.filter(l => l.accountId && (l.debit || l.credit)).map(l => ({ accountId: l.accountId, debit: r2(l.debit), credit: r2(l.credit) }));
      if (j0) Object.assign(j0, { date: j.date, memo: j.memo, lines }); else db.journals.push({ id: 'j' + uid(), num: 'JE-' + String(1 + Math.max(0, ...db.journals.map(x => parseInt(String(x.num).slice(3), 10) || 0))).padStart(3, '0'), date: j.date, memo: j.memo, lines });
      closeModal(); commit('Journal entry posted'); });
    if (j0) $('#jdel', root).addEventListener('click', () => { if (confirm('Delete this journal entry?')) { db.journals = db.journals.filter(x => x !== j0); closeModal(); commit('Entry deleted'); } });
    sync();
  }, true);
};

/* ---------- Payables ---------- */
const billBadge = b => { if (b.status === 'Paid') return badge('Paid', 'ok'); const t0 = today(); return b.due < t0 ? badge(`${diffDays(t0, b.due)}d overdue`, 'bad') : b.due <= addDays(t0, 7) ? badge('Due soon', 'warn') : badge('Open', 'vio'); };
V.payables = () => {
  ui.bf ??= 'Open'; const t0 = today(), open = db.bills.filter(b => b.status === 'Open'), od = open.filter(b => b.due < t0), soon = open.filter(b => b.due >= t0 && b.due <= addDays(t0, 7));
  const paid30 = sum(db.bills.filter(b => b.status === 'Paid' && b.paidDate >= addDays(t0, -30)), billTotal);
  const list = db.bills.filter(b => ui.bf === 'All' || b.status === ui.bf).sort((a, b) => a.due < b.due ? (ui.bf === 'Paid' ? 1 : -1) : (ui.bf === 'Paid' ? -1 : 1));
  const ag = [0, 0, 0, 0, 0]; open.forEach(b => { const n = diffDays(t0, b.due); ag[n <= 0 ? 0 : n <= 30 ? 1 : n <= 60 ? 2 : n <= 90 ? 3 : 4] += billTotal(b); });
  return { title: 'Payables', sub: 'Vendor bills, what you owe, and what to pay next.',
    actions: `<div class="seg">${['Open', 'Paid', 'All'].map(s => `<button class="${ui.bf === s ? 'on' : ''}" data-a="bf" data-v="${s}">${s}</button>`).join('')}</div><button class="btn" data-a="editVendor">+ Vendor</button><button class="btn primary" data-a="editBill">+ Bill</button>`,
    html: `<div class="stack"><div class="kpis k4">
      <div class="kpi"><div class="l">Open payables</div><div class="v">${$m(sum(open, billTotal))}</div><div class="s">${open.length} bills</div></div>
      <div class="kpi"><div class="l">Overdue</div><div class="v ${od.length ? 'neg' : ''}">${$m(sum(od, billTotal))}</div><div class="s">${od.length} bills</div></div>
      <div class="kpi"><div class="l">Due in 7 days</div><div class="v">${$m(sum(soon, billTotal))}</div><div class="s">${soon.length} bills</div></div>
      <div class="kpi"><div class="l">Paid · 30 days</div><div class="v">${$m(paid30)}</div><div class="s">Cash out to vendors</div></div></div>
    <div class="grid g2"><div class="panel"><div class="hd"><span class="eyebrow">Bills</span></div><div class="bd flush"><table><thead><tr><th>Vendor</th><th>Bill #</th><th>Date</th><th>Due</th><th class="r">Amount</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(b => `<tr class="click" data-a="editBill" data-id="${b.id}"><td><div class="nm">${esc(vend(b.vendorId)?.name || '—')}</div><div class="sm">${b.lines.map(l => esc(acct(l.accountId)?.name || '')).filter((x, i, a) => a.indexOf(x) === i).join(', ')}</div></td><td class="num">${esc(b.num)}</td><td class="num">${fd(b.date)}</td><td class="num">${fd(b.due)}</td><td class="r">${$m(billTotal(b))}</td><td>${billBadge(b)}</td><td class="r">${b.status === 'Open' ? `<button class="btn sm" data-a="payBill" data-id="${b.id}">Pay</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No bills here.</td></tr>'}</tbody></table></div></div>
      <div class="stack"><div class="panel"><div class="hd"><span class="eyebrow">A/P aging · by due date</span></div><div class="bd">${['Current', '1–30 days', '31–60 days', '61–90 days', '90+ days'].map((l, i) => `<div class="ubar" style="grid-template-columns:96px 1fr 84px"><span class="n">${l}</span>${meter(ag[i] / (Math.max(...ag) || 1), null, i === 0 ? '' : i < 2 ? 'warn' : 'bad')}<span class="num r">${$m(ag[i])}</span></div>`).join('')}</div></div>
      <div class="panel"><div class="hd"><span class="eyebrow">Vendors</span></div><div class="bd flush"><table><thead><tr><th>Vendor</th><th class="r">Owed</th><th class="r">Billed · 12 mo</th></tr></thead><tbody>
      ${db.vendors.map(v => `<tr class="click" data-a="editVendor" data-id="${v.id}"><td class="nm">${esc(v.name)}</td><td class="r">${$m(sum(open.filter(b => b.vendorId === v.id), billTotal))}</td><td class="r">${$m(sum(db.bills.filter(b => b.vendorId === v.id && b.date >= addDays(t0, -365)), billTotal))}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No vendors yet.</td></tr>'}</tbody></table></div></div></div></div></div>` };
};
A.bf = d => { ui.bf = d.v; render(); };
A.payBill = d => { const b = db.bills.find(x => x.id === d.id); b.status = 'Paid'; b.paidDate = today(); commit(`Bill #${b.num} paid`); };
A.editVendor = d => {
  const v = d.id ? vend(d.id) : null;
  form({ title: v ? 'Edit vendor' : 'New vendor', val: v || { terms: 30, defAcct: ACC.sub }, fields: [{ k: 'name', label: 'Vendor name', req: 1 }, { k: 'contact', label: 'Contact', half: 1 }, { k: 'phone', label: 'Phone', half: 1 }, { k: 'email', label: 'Email', type: 'email' }, { k: 'terms', label: 'Payment terms (days)', type: 'number', half: 1 }, { k: 'defAcct', label: 'Default expense account', type: 'select', opts: expAccts().map(a => [a.id, a.code + ' ' + a.name]), half: 1 }],
    save: x => upsert(db.vendors, x, 'v'), del: v && !db.bills.some(b => b.vendorId === v.id) && (() => { db.vendors = db.vendors.filter(y => y !== v); }) });
};
const catOf = id => ({ [ACC.sub]: 'Subconsultant', [ACC.reimb]: 'Permit fee' })[id] || 'Other';
function syncBillExpenses(b) {
  db.expenses = db.expenses.filter(x => x.billId !== b.id);
  const vn = vend(b.vendorId)?.name || 'Vendor';
  b.lines.filter(l => l.projId && proj(l.projId)).forEach(l => db.expenses.push({ id: 'x' + uid(), projId: l.projId, phaseId: l.phaseId || proj(l.projId).phases[0]?.id || '', date: b.date, vendor: vn, cat: catOf(l.accountId), amount: l.amount, markup: db.settings.markup, billable: true, billId: b.id }));
}
A.editBill = d => {
  if (!db.vendors.length) { toast('Add a vendor first.'); return A.editVendor({}); }
  const b0 = d.id ? db.bills.find(x => x.id === d.id) : null, v0 = db.vendors[0];
  const b = b0 ? JSON.parse(JSON.stringify(b0)) : { vendorId: v0.id, num: '', date: today(), due: addDays(today(), v0.terms || 30), status: 'Open', paidDate: '', lines: [{ accountId: v0.defAcct || ACC.other, desc: '', amount: 0, projId: '', phaseId: '' }] };
  const popts = id => `<option value="">No project</option>${db.projects.filter(p => p.status !== 'Closed' || p.id === id).map(p => opt(p.id, p.num + ' ' + p.name, id)).join('')}`;
  const fopts = (pid, fid) => proj(pid) ? proj(pid).phases.map(f => opt(f.id, f.name, fid)).join('') : '<option value="">—</option>';
  const body = () => b.lines.map((l, i) => `<div class="bl"><select class="inp sm" data-ba="${i}">${expAccts().map(a => opt(a.id, a.code + ' ' + a.name, l.accountId)).join('')}</select><input class="inp sm" placeholder="Description" value="${esc(l.desc)}" data-bd="${i}"><input class="inp sm" type="number" step="0.01" min="0" placeholder="Amount" value="${l.amount || ''}" data-bm="${i}"><select class="inp sm" data-bp="${i}">${popts(l.projId)}</select><select class="inp sm" data-bf="${i}" ${l.projId ? '' : 'disabled'}>${fopts(l.projId, l.phaseId)}</select><button type="button" class="x" data-br="${i}" aria-label="Remove">×</button></div>`).join('');
  modal(`<form><div class="dh"><h3>${b0 ? 'Bill #' + esc(b0.num) : 'New bill'}</h3><button type="button" class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="db one"><div class="row" style="margin-bottom:12px"><div class="fld" style="flex:2;min-width:180px"><label>Vendor</label><select class="inp" id="bvendor">${db.vendors.map(v => opt(v.id, v.name, b.vendorId)).join('')}</select></div><div class="fld" style="flex:1;min-width:110px"><label>Bill #</label><input class="inp" id="bnum" value="${esc(b.num)}" required></div><div class="fld" style="flex:1;min-width:130px"><label>Bill date</label><input class="inp" type="date" id="bdate" value="${b.date}" required></div><div class="fld" style="flex:1;min-width:130px"><label>Due</label><input class="inp" type="date" id="bdue" value="${b.due}" required></div></div>
    <div class="eyebrow" style="margin-bottom:6px">Lines — assign a project to charge it to job cost</div><div id="brows">${body()}</div><div class="spread"><button type="button" class="btn sm" id="badd">+ Line</button><span class="mono nm" id="btot"></span></div>
    <div class="row" style="margin-top:14px"><div class="fld" style="width:150px"><label>Status</label><select class="inp" id="bstat">${['Open', 'Paid'].map(s => opt(s, s, b.status)).join('')}</select></div><div class="fld" style="width:150px"><label>Paid on</label><input class="inp" type="date" id="bpaid" value="${b.paidDate || today()}"></div></div></div>
    <div class="df"><div>${b0 ? '<button type="button" class="btn danger" id="bdel">Delete</button>' : ''}</div><div class="row"><button type="button" class="btn ghost" data-a="close">Cancel</button><button class="btn primary">Save bill</button></div></div></form>`, root => {
    const sync = () => { b.vendorId = $('#bvendor', root).value; b.num = $('#bnum', root).value; b.date = $('#bdate', root).value; b.due = $('#bdue', root).value; b.status = $('#bstat', root).value; b.paidDate = b.status === 'Paid' ? $('#bpaid', root).value : ''; $('#bpaid', root).disabled = b.status !== 'Paid';
      $$('[data-ba]', root).forEach(e => b.lines[e.dataset.ba].accountId = e.value); $$('[data-bd]', root).forEach(e => b.lines[e.dataset.bd].desc = e.value); $$('[data-bm]', root).forEach(e => b.lines[e.dataset.bm].amount = parseFloat(e.value) || 0); $$('[data-bf]', root).forEach(e => b.lines[e.dataset.bf].phaseId = e.value); $('#btot', root).textContent = 'Total ' + usd.format(sum(b.lines, l => l.amount)); };
    const redraw = () => { $('#brows', root).innerHTML = body(); sync(); };
    root.addEventListener('input', sync);
    root.addEventListener('change', ev => { const t = ev.target;
      if (t.id === 'bvendor' && !b0) { const v = vend(t.value); b.due = addDays($('#bdate', root).value, v.terms || 30); $('#bdue', root).value = b.due; if (v.defAcct && b.lines.length === 1 && !b.lines[0].amount) { b.lines[0].accountId = v.defAcct; redraw(); } }
      if (t.id === 'bdate' && !b0) { const v = vend($('#bvendor', root).value); $('#bdue', root).value = addDays(t.value, v?.terms || 30); }
      if (t.dataset.bp !== undefined) { sync(); const l = b.lines[t.dataset.bp]; l.projId = t.value; l.phaseId = proj(t.value)?.phases[0]?.id || ''; redraw(); } sync(); });
    root.addEventListener('click', ev => { const rm = ev.target.closest('[data-br]'); if (rm) { sync(); b.lines.splice(rm.dataset.br, 1); if (!b.lines.length) b.lines.push({ accountId: ACC.other, desc: '', amount: 0, projId: '', phaseId: '' }); redraw(); } if (ev.target.id === 'badd') { sync(); b.lines.push({ accountId: vend(b.vendorId)?.defAcct || ACC.other, desc: '', amount: 0, projId: '', phaseId: '' }); redraw(); } });
    root.querySelector('form').addEventListener('submit', ev => { ev.preventDefault(); sync(); const lines = b.lines.filter(l => l.amount > 0).map(l => ({ accountId: l.accountId, desc: l.desc, amount: r2(l.amount), projId: l.projId || '', phaseId: l.projId ? l.phaseId : '' }));
      if (!lines.length) return toast('Enter an amount on at least one line.');
      const nb = { vendorId: b.vendorId, num: b.num, date: b.date, due: b.due, status: b.status, paidDate: b.paidDate, lines };
      if (b0) Object.assign(b0, nb); else db.bills.push({ ...nb, id: 'b' + uid() });
      syncBillExpenses(b0 || db.bills[db.bills.length - 1]); closeModal(); commit('Bill saved'); });
    if (b0) $('#bdel', root).addEventListener('click', () => { if (confirm('Delete this bill? Any job-cost expenses created from it are removed too.')) { db.expenses = db.expenses.filter(x => x.billId !== b0.id); db.bills = db.bills.filter(x => x !== b0); closeModal(); commit('Bill deleted'); } });
    sync();
  }, true);
};

/* ---------- Payroll ---------- */
const mkLine = (empId, hours, rate, p) => { const gross = r2(hours * rate), wh = r2(gross * p.wh / 100), er = r2(gross * p.er / 100); return { empId, hours, rate, gross, wh, er, net: r2(gross - wh) }; };
function runLines(start, end, p) { return db.employees.filter(e => e.active).map(e => mkLine(e.id, sum(db.time.filter(t => t.empId === e.id && t.date >= start && t.date <= end), t => t.hours), e.cost, p)).filter(l => l.hours > 0); }
V.payroll = () => {
  const t0 = today(), runs = db.payruns.slice().sort((a, b) => a.payDate < b.payDate ? 1 : -1), paid = runs.filter(r => r.status === 'Paid'), dr = runs.filter(r => r.status === 'Draft').pop();
  const ytd = paid.filter(r => r.payDate >= t0.slice(0, 4) + '-01-01'), liab = acctBal(ACC.pl);
  return { title: 'Payroll', sub: 'Pay runs built from approved timesheets. Estimates and bookkeeping only — not a payroll or tax filing service.',
    actions: `<button class="btn" data-a="remit">Remit payroll taxes</button><button class="btn primary" data-a="newRun">+ New pay run</button>`,
    html: `<div class="stack"><div class="kpis k4">
      <div class="kpi"><div class="l">Next pay date</div><div class="v">${dr ? fd(dr.payDate) : '—'}</div><div class="s">${dr ? $m(runTot(dr, 'gross')) + ' gross · ' + dr.lines.length + ' people' : 'No draft run'}</div></div>
      <div class="kpi"><div class="l">Payroll liabilities</div><div class="v">${$m(liab)}</div><div class="s ${liab > 1 ? 'warn' : ''}">Withheld + employer tax, not yet remitted</div></div>
      <div class="kpi"><div class="l">Gross wages · YTD</div><div class="v">${$k(sum(ytd, r => runTot(r, 'gross')))}</div><div class="s">${ytd.length} pay runs</div></div>
      <div class="kpi"><div class="l">Employer taxes · YTD</div><div class="v">${$k(sum(ytd, r => runTot(r, 'er')))}</div><div class="s">${db.settings.payEmployer ?? 8.65}% of gross</div></div></div>
    <div class="panel"><div class="bd flush"><table><thead><tr><th>Run</th><th>Pay period</th><th>Pay date</th><th class="r">People</th><th class="r">Gross</th><th class="r">Withheld</th><th class="r">Employer tax</th><th class="r">Net pay</th><th>Status</th></tr></thead><tbody>
    ${runs.map(r => `<tr class="click" data-a="viewRun" data-id="${r.id}"><td class="nm mono">${esc(r.num)}</td><td class="num">${fd(r.start)} – ${fd(r.end)}</td><td class="num">${fd(r.payDate)}</td><td class="r">${r.lines.length}</td><td class="r">${$m(runTot(r, 'gross'))}</td><td class="r">${$m(runTot(r, 'wh'))}</td><td class="r">${$m(runTot(r, 'er'))}</td><td class="r">${$m(runTot(r, 'net'))}</td><td>${r.status === 'Paid' ? badge('Paid', 'ok') : r.payDate < t0 ? badge('Overdue', 'bad') : badge('Draft', 'vio')}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">No pay runs yet. Create one from approved timesheets.</td></tr>'}</tbody></table></div></div></div>` };
};
A.newRun = () => {
  const last = db.payruns.map(r => r.end).sort().pop(), start = last ? addDays(last, 1) : addDays(monday(today()), -14), end = addDays(start, 13);
  form({ title: 'New pay run', saveLabel: 'Create run', val: { start, end, payDate: addDays(end, 5) }, fields: [{ k: 'start', label: 'Period start', type: 'date', half: 1, req: 1 }, { k: 'end', label: 'Period end', type: 'date', half: 1, req: 1 }, { k: 'payDate', label: 'Pay date', type: 'date', half: 1, req: 1 }],
    save: v => { if (v.end < v.start) { toast('End date is before the start date.'); return false; } if (db.payruns.some(r => r.start <= v.end && r.end >= v.start)) { toast('That period overlaps an existing pay run.'); return false; }
      const p = payRates(), lines = runLines(v.start, v.end, p); if (!lines.length) { toast('No hours are logged in that period.'); return false; }
      db.payruns.push({ id: 'r' + uid(), num: 'PR-' + String(1 + db.payruns.length).padStart(3, '0'), start: v.start, end: v.end, payDate: v.payDate, status: 'Draft', whPct: p.wh, erPct: p.er, lines }); } });
};
A.viewRun = d => {
  const r = db.payruns.find(x => x.id === d.id), draft = r.status === 'Draft', lines = JSON.parse(JSON.stringify(r.lines)), p = { wh: r.whPct, er: r.erPct };
  const unapp = sum(db.time.filter(t => t.date >= r.start && t.date <= r.end && !t.approved), t => t.hours);
  const rowsH = () => lines.map((l, i) => `<tr data-row="${i}"><td>${who(l.empId)}</td><td class="r">${draft ? `<input class="inp sm" type="number" step="0.25" min="0" style="width:80px;text-align:right" value="${l.hours}" data-rh="${i}">` : hr(l.hours)}</td><td class="r">$${l.rate}/h</td><td class="r" data-c-gross>${$m(l.gross)}</td><td class="r" data-c-wh>${$m(l.wh)}</td><td class="r" data-c-er>${$m(l.er)}</td><td class="r nm" data-c-net>${$m(l.net)}</td></tr>`).join('');
  const tot = () => `<td colspan="3">Total</td><td class="r">${$m(sum(lines, l => l.gross))}</td><td class="r">${$m(sum(lines, l => l.wh))}</td><td class="r">${$m(sum(lines, l => l.er))}</td><td class="r">${$m(sum(lines, l => l.net))}</td>`;
  modal(`<div class="dh"><div><h3>${esc(r.num)} · ${fd(r.start)} – ${fd(r.end)}</h3><div class="note">Pay date ${fdy(r.payDate)} · withholding ${r.whPct}% · employer tax ${r.erPct}%</div></div><button type="button" class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="db one">${draft && unapp ? `<div class="note" style="color:var(--amber);margin-bottom:8px">${hr(unapp)} h in this period are not approved yet.</div>` : ''}<table><thead><tr><th>Employee</th><th class="r">Hours</th><th class="r">Rate</th><th class="r">Gross</th><th class="r">Withheld</th><th class="r">Employer tax</th><th class="r">Net pay</th></tr></thead><tbody id="rl">${rowsH()}</tbody><tfoot><tr id="rt">${tot()}</tr></tfoot></table>
    <div class="note" style="margin-top:10px">Marking this run paid posts to the books on its pay date (${fdy(r.payDate)}): Dr Salaries &amp; Wages and Payroll Taxes · Cr Payroll Liabilities and Operating Cash.</div></div>
    <div class="df"><button class="btn danger" id="rdel">${draft ? 'Delete run' : 'Reopen as draft'}</button><div class="row">${draft ? '<button class="btn" id="rsave">Save hours</button><button class="btn primary" id="rpay">Mark paid &amp; post</button>' : '<button class="btn" data-a="close">Close</button>'}</div></div>`, root => {
    root.addEventListener('input', ev => { const i = ev.target.dataset.rh; if (i === undefined) return; const l = lines[i]; lines[i] = mkLine(l.empId, parseFloat(ev.target.value) || 0, l.rate, p); const tr = root.querySelector(`[data-row="${i}"]`), n = lines[i]; tr.querySelector('[data-c-gross]').textContent = $m(n.gross); tr.querySelector('[data-c-wh]').textContent = $m(n.wh); tr.querySelector('[data-c-er]').textContent = $m(n.er); tr.querySelector('[data-c-net]').textContent = $m(n.net); $('#rt', root).innerHTML = tot(); });
    $('#rdel', root).addEventListener('click', () => { if (draft) { if (!confirm('Delete this draft pay run?')) return; db.payruns = db.payruns.filter(x => x !== r); closeModal(); commit('Pay run deleted'); } else { if (!confirm('Reopen this run? Its ledger entries are removed until it is paid again.')) return; r.status = 'Draft'; closeModal(); commit('Run reopened'); } });
    if (draft) { $('#rsave', root).addEventListener('click', () => { r.lines = lines.filter(l => l.hours > 0); closeModal(); commit('Pay run saved'); });
      $('#rpay', root).addEventListener('click', () => { if (unapp && !confirm(`${hr(unapp)} h in this period are not approved. Post anyway?`)) return; r.lines = lines.filter(l => l.hours > 0); r.status = 'Paid'; closeModal(); commit('Pay run posted to the books'); }); }
  }, true);
};
A.remit = () => {
  const bal = Math.max(0, r2(acctBal(ACC.pl)));
  form({ title: 'Remit payroll taxes', saveLabel: 'Post payment', val: { date: today(), amount: bal, memo: 'Remit payroll taxes' }, fields: [{ k: 'date', label: 'Date', type: 'date', half: 1 }, { k: 'amount', label: `Amount (owed ${usd.format(bal)})`, type: 'number', half: 1 }, { k: 'memo', label: 'Memo' }],
    save: v => { if (v.amount <= 0) { toast('Enter an amount.'); return false; } db.journals.push({ id: 'j' + uid(), num: 'JE-' + String(1 + Math.max(0, ...db.journals.map(x => parseInt(String(x.num).slice(3), 10) || 0))).padStart(3, '0'), date: v.date, memo: v.memo, lines: [{ accountId: ACC.pl, debit: r2(v.amount), credit: 0 }, { accountId: ACC.cash, debit: 0, credit: r2(v.amount) }] }); } });
};

/* ---------- Financials ---------- */
V.financials = () => {
  ui.fp ??= 'ytd'; const [from, to] = periodRange(ui.fp), S = statements(from, to), bal = Math.abs(S.ta - S.tl - S.tq) < 0.5, tbOk = Math.abs(S.tdr - S.tcr) < 0.5;
  const line = (a, v) => `<tr class="click" data-a="glAcct" data-id="${a.id}"><td class="indent"><span class="num sm">${esc(a.code)}</span> ${esc(a.name)}</td><td class="r">${$m(v)}</td></tr>`;
  const sec = t => `<tr class="sec"><td colspan="2">${t}</td></tr>`, tot = (t, v) => `<tr class="tot"><td>${t}</td><td class="r">${$m(v)}</td></tr>`;
  return { title: 'Financials', sub: `${ui.fp === 'all' ? 'All time' : fdy(from) + ' – ' + fdy(to)} · ledger derived from your project and billing data`,
    actions: `<div class="seg" style="flex-wrap:wrap">${PERIODS.map(([k, l]) => `<button class="${ui.fp === k ? 'on' : ''}" data-a="fp" data-v="${k}">${l}</button>`).join('')}</div>`,
    html: `<div class="stack"><div class="kpis k5">
      <div class="kpi"><div class="l">Revenue</div><div class="v">${$k(S.tr)}</div><div class="s">Invoiced in period</div></div>
      <div class="kpi"><div class="l">Expenses</div><div class="v">${$k(S.te)}</div><div class="s">Incl. payroll</div></div>
      <div class="kpi"><div class="l">Net income</div><div class="v ${S.net < 0 ? 'neg' : ''}">${$k(S.net)}</div><div class="s">${S.tr ? pc(S.net / S.tr) + ' margin' : '—'}</div></div>
      <div class="kpi"><div class="l">Cash</div><div class="v">${$k(cashBal())}</div><div class="s">Operating account</div></div>
      <div class="kpi"><div class="l">Books check</div><div class="v ${bal && tbOk ? 'pos' : 'neg'}">${bal && tbOk ? 'Balanced' : 'Off'}</div><div class="s">Assets = liabilities + equity</div></div></div>
    <div class="grid g2e"><div class="panel"><div class="hd"><span class="eyebrow">Income statement</span><button class="btn sm" data-a="stmtCsv" data-v="pl">CSV</button></div><div class="bd flush"><table class="stmt"><tbody>
      ${sec('Revenue')}${S.rev.map(([a, v]) => line(a, v)).join('')}${tot('Total revenue', S.tr)}${sec('Expenses')}${S.exp.map(([a, v]) => line(a, v)).join('')}${tot('Total expenses', S.te)}${tot('Net income', S.net)}</tbody></table></div></div>
    <div class="panel"><div class="hd"><span class="eyebrow">Balance sheet · as of ${fd(to)}</span><button class="btn sm" data-a="stmtCsv" data-v="bs">CSV</button></div><div class="bd flush"><table class="stmt"><tbody>
      ${sec('Assets')}${S.assets.map(([a, v]) => line(a, v)).join('')}${tot('Total assets', S.ta)}${sec('Liabilities')}${S.liab.map(([a, v]) => line(a, v)).join('')}${tot('Total liabilities', S.tl)}${sec('Equity')}${S.eq.map(([a, v]) => line(a, v)).join('')}<tr><td class="indent">Net income to date</td><td class="r">${$m(S.earn)}</td></tr>${tot('Total equity', S.tq)}${tot('Liabilities + equity', S.tl + S.tq)}</tbody></table></div></div></div>
    <div class="panel"><div class="hd"><span class="eyebrow">Trial balance · as of ${fd(to)}</span><button class="btn sm" data-a="stmtCsv" data-v="tb">CSV</button></div><div class="bd flush"><table class="stmt"><thead><tr><th>Account</th><th class="r">Debit</th><th class="r">Credit</th></tr></thead><tbody>
      ${S.tb.map(([a, dr, cr]) => `<tr class="click" data-a="glAcct" data-id="${a.id}"><td class="indent"><span class="num sm">${esc(a.code)}</span> ${esc(a.name)}</td><td class="r">${dr ? $m(dr) : ''}</td><td class="r">${cr ? $m(cr) : ''}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="r">${$m(S.tdr)}</td><td class="r">${$m(S.tcr)}</td></tr></tfoot></table></div></div></div>` };
};
A.fp = d => { ui.fp = d.v; render(); };
A.stmtCsv = d => {
  const [from, to] = periodRange(ui.fp), S = statements(from, to), q = c => '"' + String(c).replace(/"/g, '""') + '"'; let rows;
  if (d.v === 'pl') rows = [['Account', 'Amount'], ...S.rev.map(([a, v]) => [a.code + ' ' + a.name, v]), ['Total revenue', S.tr], ...S.exp.map(([a, v]) => [a.code + ' ' + a.name, v]), ['Total expenses', S.te], ['Net income', S.net]];
  else if (d.v === 'bs') rows = [['Account', 'Amount'], ...S.assets.map(([a, v]) => [a.code + ' ' + a.name, v]), ['Total assets', S.ta], ...S.liab.map(([a, v]) => [a.code + ' ' + a.name, v]), ['Total liabilities', S.tl], ...S.eq.map(([a, v]) => [a.code + ' ' + a.name, v]), ['Net income to date', S.earn], ['Total equity', S.tq]];
  else rows = [['Account', 'Debit', 'Credit'], ...S.tb.map(([a, dr, cr]) => [a.code + ' ' + a.name, dr, cr]), ['Total', S.tdr, S.tcr]];
  download(({ pl: 'income-statement', bs: 'balance-sheet', tb: 'trial-balance' })[d.v] + '-' + today() + '.csv', rows.map(r => r.map(c => q(typeof c === 'number' ? c.toFixed(2) : c)).join(',')).join('\r\n'), 'text/csv');
};

/* ---------- nav ---------- */
(() => { const i = NAV.findIndex(n => n[0] === '' && n[1] === ''); NAV.splice(i, 0, ['', 'Books'], ['ledger', 'Ledger'], ['payables', 'Payables'], ['payroll', 'Payroll'], ['financials', 'Financials']); })();
