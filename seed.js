/* Demo data, generated relative to today's date so the office always looks "live".
   Everything here is fictional. Replace it from Settings → Start with a blank office. */
function makeSeed() {
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const D = s => new Date(s + 'T12:00:00');
  const add = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return iso(d); };
  const today = iso(new Date());
  const mon = (() => { const d = D(today); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); })();
  let sd = 11; const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
  let n = 0; const id = p => p + (++n);

  const employees = [
    { id: 'e1', name: 'Dana Whitcomb, PE', title: 'Principal', cost: 78, bill: 210, cap: 40, target: 50 },
    { id: 'e2', name: 'Marcus Bell, PE', title: 'Project Manager', cost: 62, bill: 175, cap: 40, target: 70 },
    { id: 'e3', name: 'Priya Nair, PE', title: 'Senior Project Engineer', cost: 54, bill: 155, cap: 40, target: 80 },
    { id: 'e4', name: 'Tom Gallagher, EIT', title: 'Project Engineer', cost: 41, bill: 125, cap: 40, target: 85 },
    { id: 'e5', name: 'Elena Ruiz, EIT', title: 'Staff Engineer', cost: 36, bill: 110, cap: 40, target: 85 },
    { id: 'e6', name: 'Chris Doyle', title: 'Senior CAD Designer', cost: 38, bill: 105, cap: 40, target: 88 },
    { id: 'e7', name: 'Sam Okafor, LLS', title: 'Survey Manager', cost: 52, bill: 150, cap: 40, target: 75 },
    { id: 'e8', name: 'Jo Lindqvist', title: 'Office & Accounting', cost: 30, bill: 75, cap: 32, target: 0 },
  ].map(e => ({ ...e, active: true }));

  const clients = [
    { id: 'c1', name: 'Northfield Homes LLC', contact: 'Rachel Stone', email: 'rstone@northfieldhomes.example', phone: '(603) 555-0142' },
    { id: 'c2', name: 'Kestrel Self Storage', contact: 'Vik Patel', email: 'vik@kestrelstorage.example', phone: '(603) 555-0177' },
    { id: 'c3', name: 'Town of Ashby Falls — DPW', contact: 'Bill Hartwell', email: 'dpw@ashbyfalls.example', phone: '(603) 555-0110' },
    { id: 'c4', name: 'Pine Hollow Campground', contact: 'Meg Sorensen', email: 'meg@pinehollow.example', phone: '(603) 555-0163' },
    { id: 'c5', name: 'Merrimack Valley Dental', contact: 'Dr. Alan Cho', email: 'office@mvdental.example', phone: '(603) 555-0129' },
    { id: 'c6', name: 'Harlow Development Group', contact: 'Jess Harlow', email: 'jess@harlowdev.example', phone: '(603) 555-0188' },
  ];

  const P = (id, num, name, clientId, pmId, type, status, start, due, town, notes, phases) =>
    ({ id, num, name, clientId, pmId, type, status, start: add(today, start), due: add(today, due), town, notes, phases: phases.map(([pid, nm, fee, hours, pct]) => ({ id: pid, name: nm, fee, hours, pct })) });
  const projects = [
    P('p1', '26-014', 'Northfield Estates — 18-Lot Subdivision', 'c1', 'e2', 'fixed', 'Active', -118, 96, 'Bedford, NH', 'AoT permit required. Planning Board hearing targeted for next month.', [
      ['p1a', 'Survey & Existing Conditions', 36000, 215, 100], ['p1b', 'Preliminary Design', 84000, 590, 100], ['p1c', 'Final Design & Stormwater', 118000, 760, 65], ['p1d', 'Permitting (AoT / Planning Board)', 22000, 150, 20], ['p1e', 'Construction Administration', 18000, 130, 0]]),
    P('p2', '26-021', 'Kestrel Self Storage — Site Plan', 'c2', 'e2', 'fixed', 'Active', -72, 34, 'Hooksett, NH', 'Client added a third building after 60% design — change order not yet issued.', [
      ['p2a', 'Boundary & Topographic Survey', 8500, 60, 100], ['p2b', 'Site Design', 52000, 400, 80], ['p2c', 'Drainage Analysis & Report', 18000, 115, 60], ['p2d', 'Permitting', 9500, 65, 15]]),
    P('p3', '26-027', 'Ashby Falls Culvert Replacement', 'c3', 'e1', 'tm', 'Active', -65, 48, 'Ashby Falls, NH', 'T&M, not to exceed. Stream crossing rules apply — wetlands permit.', [
      ['p3a', 'Survey', 7000, 48, 0], ['p3b', 'Hydrologic & Hydraulic Study', 34000, 240, 0], ['p3c', 'Final Design & Bid Docs', 30000, 230, 0]]),
    P('p4', '26-031', 'Pine Hollow Campground Expansion', 'c4', 'e2', 'fixed', 'Active', -50, 110, 'Milton, NH', '42 new RV sites, bathhouse, septic expansion.', [
      ['p4a', 'Existing Conditions Survey', 40000, 225, 90], ['p4b', 'Concept & Site Plan', 36000, 270, 15], ['p4c', 'Septic & Utilities Design', 21000, 160, 0], ['p4d', 'Permitting', 12000, 85, 0]]),
    P('p5', '26-035', 'Merrimack Valley Dental — Parking Expansion', 'c5', 'e2', 'fixed', 'Active', -86, -4, 'Merrimack, NH', 'Punch list walk remaining.', [
      ['p5a', 'Site Design', 19000, 150, 100], ['p5b', 'Permitting', 3500, 22, 100], ['p5c', 'Construction Administration', 3000, 22, 80]]),
    P('p6', '26-038', 'Harlow Mixed-Use — Feasibility & Concept', 'c6', 'e1', 'tm', 'Active', -43, 20, 'Manchester, NH', 'Hourly. Client wants yield study for two zoning scenarios.', [
      ['p6a', 'Feasibility & Concept', 28000, 160, 0]]),
    P('p7', '26-041', 'Route 9 Commerce Park — Site & Roadway', 'c6', 'e2', 'fixed', 'Proposal', 14, 240, 'Concord, NH', 'Proposal submitted. Decision expected in two weeks.', [
      ['p7a', 'Survey', 22000, 150, 0], ['p7b', 'Site & Roadway Design', 96000, 720, 0], ['p7c', 'Permitting', 26000, 180, 0]]),
    P('p8', '25-088', 'Birch Lane Septic Redesign', 'c1', 'e3', 'fixed', 'Closed', -150, -85, 'Bedford, NH', 'Closed out.', [
      ['p8a', 'Design & Permitting', 19500, 155, 100]]),
  ];

  // [employee, project, phase, weight, fromWeeksAgo, toWeeksAgo]
  const A = [
    ['e7', 'p1', 'p1a', 3, 16, 12], ['e6', 'p1', 'p1a', 1, 14, 12],
    ['e3', 'p1', 'p1b', 3, 13, 8], ['e4', 'p1', 'p1b', 3, 13, 8], ['e6', 'p1', 'p1b', 2, 12, 8], ['e2', 'p1', 'p1b', 1, 13, 8],
    ['e3', 'p1', 'p1c', 3, 7, 0], ['e4', 'p1', 'p1c', 3, 7, 0], ['e6', 'p1', 'p1c', 2, 7, 0], ['e2', 'p1', 'p1c', 1, 7, 0], ['e1', 'p1', 'p1c', 1, 5, 0],
    ['e2', 'p1', 'p1d', 1, 3, 0], ['e3', 'p1', 'p1d', 1, 2, 0],
    ['e7', 'p2', 'p2a', 2, 10, 9],
    ['e5', 'p2', 'p2b', 3, 9, 0], ['e6', 'p2', 'p2b', 2, 9, 0], ['e2', 'p2', 'p2b', 2, 9, 0],
    ['e5', 'p2', 'p2c', 2, 5, 0], ['e3', 'p2', 'p2c', 1, 4, 0], ['e2', 'p2', 'p2d', 1, 2, 0],
    ['e7', 'p3', 'p3a', 2, 9, 8], ['e3', 'p3', 'p3b', 2, 9, 4], ['e4', 'p3', 'p3b', 2, 9, 3], ['e1', 'p3', 'p3b', 1, 9, 4],
    ['e4', 'p3', 'p3c', 2, 3, 0], ['e6', 'p3', 'p3c', 1, 3, 0], ['e1', 'p3', 'p3c', 1, 3, 0],
    ['e7', 'p4', 'p4a', 3, 7, 0], ['e6', 'p4', 'p4a', 1, 5, 3], ['e5', 'p4', 'p4b', 2, 3, 0], ['e2', 'p4', 'p4b', 1, 3, 0], ['e4', 'p4', 'p4b', 1, 2, 0],
    ['e5', 'p5', 'p5a', 3, 12, 10], ['e6', 'p5', 'p5a', 1, 11, 10], ['e2', 'p5', 'p5b', 0.5, 9, 7], ['e4', 'p5', 'p5c', 0.4, 5, 1],
    ['e1', 'p6', 'p6a', 2, 6, 0], ['e3', 'p6', 'p6a', 1, 6, 2], ['e6', 'p6', 'p6a', 1, 4, 1], ['e7', 'p6', 'p6a', 1, 6, 5],
    ['e5', 'p8', 'p8a', 3, 16, 13], ['e7', 'p8', 'p8a', 1, 16, 15],
  ];
  const notes = ['Grading revisions', 'Plan set markups', 'Client coordination call', 'Stormwater calcs', 'Site visit', 'Detail sheets', 'Abutter research', 'Redlines from PM', 'HydroCAD model', 'Permit application', 'QA/QC review', 'Profile sheets', 'Utility layout', 'Field data reduction'];
  const time = [];
  const lastMon = add(mon, -7);
  for (let w = 16; w >= 0; w--) {
    for (let d = 0; d < 5; d++) {
      const date = add(mon, -7 * w + d);
      if (date > today) continue;
      for (const e of employees) {
        const act = A.filter(a => a[0] === e.id && a[4] >= w && a[5] <= w);
        let bill = 0;
        if (act.length) {
          bill = Math.round(8 * (e.target / 100) * (0.82 + rnd() * 0.4) * 2) / 2;
          bill = Math.min(bill, 9);
          const pick = act.slice().sort(() => rnd() - 0.5).sort((a, b) => b[3] * rnd() - a[3] * rnd()).slice(0, bill > 5 && act.length > 1 ? 2 : 1);
          const tw = pick.reduce((s, a) => s + a[3], 0);
          let left = bill;
          pick.forEach((a, i) => {
            const h = i === pick.length - 1 ? left : Math.round(bill * a[3] / tw * 2) / 2;
            left -= h;
            if (h > 0) time.push({ id: id('t'), empId: e.id, projId: a[1], phaseId: a[2], date, hours: h, note: notes[Math.floor(rnd() * notes.length)], approved: date < lastMon || (date < mon && !['e4', 'e6'].includes(e.id)) });
          });
        }
        const day = e.cap / 5;
        if (bill < day) {
          const code = e.id === 'e1' && rnd() < 0.5 ? 'Marketing / proposals' : rnd() < 0.04 ? 'PTO' : 'General admin';
          time.push({ id: id('t'), empId: e.id, projId: '', phaseId: code, date, hours: day - bill, note: '', approved: date < lastMon || (date < mon && !['e4', 'e6'].includes(e.id)) });
        }
      }
    }
  }

  const X = (projId, phaseId, daysAgo, vendor, cat, amount, markup = 10, billable = true) => ({ id: id('x'), projId, phaseId, date: add(today, -daysAgo), vendor, cat, amount, markup, billable });
  const expenses = [
    X('p1', 'p1a', 96, 'Greenleaf Wetland Science', 'Subconsultant', 6800), X('p1', 'p1c', 31, 'Granite Geotechnical', 'Subconsultant', 9400),
    X('p1', 'p1d', 12, 'NHDES — AoT application fee', 'Permit fee', 3125, 0), X('p1', 'p1c', 20, 'Blueprint Express', 'Printing', 412),
    X('p2', 'p2a', 61, 'Mileage — field crew', 'Mileage', 148, 0), X('p2', 'p2c', 18, 'Granite Geotechnical', 'Subconsultant', 3600),
    X('p3', 'p3b', 40, 'Greenleaf Wetland Science', 'Subconsultant', 4200), X('p3', 'p3a', 58, 'Mileage — field crew', 'Mileage', 96, 0),
    X('p4', 'p4a', 26, 'AeroTopo Drone Mapping', 'Subconsultant', 5200), X('p4', 'p4a', 24, 'Mileage — field crew', 'Mileage', 212, 0),
    X('p5', 'p5b', 55, 'Town of Merrimack — site plan fee', 'Permit fee', 850, 0), X('p6', 'p6a', 15, 'Blueprint Express', 'Printing', 186),
    X('p8', 'p8a', 120, 'NHDES — septic approval fee', 'Permit fee', 420, 0),
  ];

  // Invoices: bill a fraction of what's been earned, in up to three monthly invoices.
  const emp = Object.fromEntries(employees.map(e => [e.id, e]));
  const invoices = []; let num = 1031;
  const frac = { p1: 0.86, p2: 0.74, p3: 0.8, p4: 0.55, p5: 0.93, p6: 0.6, p8: 1 };
  for (const p of projects) {
    if (!frac[p.id]) continue;
    const earned = {};
    for (const f of p.phases) {
      const lb = time.filter(t => t.phaseId === f.id).reduce((s, t) => s + t.hours * emp[t.empId].bill, 0);
      const eb = expenses.filter(x => x.phaseId === f.id).reduce((s, x) => s + x.amount * (1 + x.markup / 100), 0);
      earned[f.id] = p.type === 'fixed' ? f.fee * f.pct / 100 : lb + eb;
    }
    const cuts = p.id === 'p8' ? [[1, 95, 'Paid']] : [[0.45, 74, 'Paid'], [0.3, 43, 'Sent'], [0.25, 12, 'Sent']];
    if (p.id === 'p1' || p.id === 'p3') cuts[1][2] = 'Paid';
    for (const [share, ago, status] of cuts) {
      const lines = p.phases.map(f => ({ phaseId: f.id, desc: f.name, amount: Math.round(earned[f.id] * frac[p.id] * share / 50) * 50 })).filter(l => l.amount > 0);
      if (!lines.length) continue;
      const date = add(today, -ago);
      invoices.push({ id: id('i'), num: String(num++), projId: p.id, date, due: add(date, 30), status, paidDate: status === 'Paid' ? add(date, 24) : '', lines });
    }
  }
  invoices.sort((a, b) => a.date < b.date ? -1 : 1).forEach((v, i) => v.num = String(1031 + i));

  const T = (projId, title, empId, due, status, kind = 'Task') => ({ id: id('k'), projId, title, empId, due: add(today, due), status, kind });
  const tasks = [
    T('p1', 'Submit AoT permit application to NHDES', 'e2', 4, 'In progress', 'Permit'), T('p1', 'Planning Board hearing — final subdivision', 'e2', 23, 'To do', 'Deadline'),
    T('p1', 'Finish detention basin outlet design', 'e3', 2, 'In progress'), T('p1', 'Road profiles — Sta 0+00 to 14+50', 'e4', -1, 'Review'),
    T('p1', 'Update lot grading for lots 9–12', 'e6', 6, 'To do'), T('p2', 'Issue change order for Building C', 'e2', -3, 'To do'),
    T('p2', 'Drainage report — post-development model', 'e5', 5, 'In progress'), T('p2', 'Hooksett TRC submission', 'e2', 12, 'To do', 'Deadline'),
    T('p2', 'Lighting plan coordination', 'e6', 8, 'To do'), T('p3', 'Wetlands permit — stream crossing', 'e1', 9, 'In progress', 'Permit'),
    T('p3', '60% plans to DPW for review', 'e4', 3, 'In progress', 'Deadline'), T('p3', 'Hydraulic report QA/QC', 'e3', -6, 'Done'),
    T('p4', 'Finish topo of north field', 'e7', 1, 'In progress'), T('p4', 'Concept layout for RV loop', 'e5', 10, 'To do'),
    T('p4', 'Test pits with septic designer', 'e7', 15, 'To do'), T('p5', 'Punch list site walk', 'e4', -2, 'To do'),
    T('p5', 'As-built certification letter', 'e2', 7, 'To do'), T('p6', 'Yield study — scenario B', 'e1', 4, 'In progress'),
    T('p6', 'Present concepts to client', 'e1', 11, 'To do', 'Deadline'), T('p7', 'Follow up on proposal', 'e2', 6, 'To do'),
    T('p1', 'Boundary plan recorded', 'e7', -60, 'Done'), T('p2', 'Topo survey delivered', 'e7', -55, 'Done'),
  ];

  const plan = [];
  for (let w = 0; w < 6; w++) {
    const week = add(mon, 7 * w);
    for (const e of employees) {
      const act = A.filter(a => a[0] === e.id && a[5] === 0);
      const byProj = {};
      act.forEach(a => byProj[a[1]] = (byProj[a[1]] || 0) + a[3]);
      const tw = Object.values(byProj).reduce((s, v) => s + v, 0);
      const total = e.cap * e.target / 100 * (w > 3 ? 0.6 : 1);
      for (const [pid, wt] of Object.entries(byProj)) {
        let h = Math.round(total * wt / tw / 2) * 2;
        if (e.id === 'e3' && pid === 'p2' && (w === 1 || w === 2)) h += 14;
        if (e.id === 'e5' && pid === 'p2' && w === 1) h += 8;
        if (h > 0) plan.push({ id: id('a'), empId: e.id, projId: pid, week, hours: h });
      }
    }
  }


  /* ---------- books: vendors, bills, payroll, opening balances ---------- */
  const accounts = defaultAccounts();
  const V_ = (name, contact, terms, defAcct) => ({ id: id('v'), name, contact, email: contact.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com', phone: '(603) 555-01' + String(10 + (n % 80)), terms, defAcct });
  const vendors = [V_('Granite Geotechnical', 'Pat Moriarty', 30, 'a5200'), V_('Greenleaf Wetland Science', 'Lena Frost', 30, 'a5200'), V_('AeroTopo Drone Mapping', 'Dev Rao', 30, 'a5200'), V_('Blueprint Express', 'Counter Desk', 30, 'a5300'),
    V_('Riverside Office Park', 'Property Mgmt', 15, 'a6000'), V_('CivilSoft Licensing', 'Billing Dept', 30, 'a6100'), V_('Summit Business Insurance', 'Agent Services', 30, 'a6200'), V_('Northline Office Supply', 'Accounts', 30, 'a6300')];
  const vByName = Object.fromEntries(vendors.map(v => [v.name, v]));
  const bills = []; let bn = 2200;
  const mkBill = (v, date, lines, num) => { const paid = date < add(today, -33); const b = { id: id('b'), vendorId: v.id, num: num || (v.name.split(' ').map(w => w[0]).join('') + '-' + (++bn)), date, due: add(date, v.terms), status: paid ? 'Paid' : 'Open', paidDate: paid ? add(date, v.terms - 4) : '', lines }; bills.push(b); return b; };
  for (const x of expenses) {
    const v = vByName[x.vendor]; if (!v) continue;   // permit fees and mileage stay as direct (paid) expenses
    const b = mkBill(v, x.date, [{ accountId: x.cat === 'Subconsultant' ? 'a5200' : 'a5300', desc: x.cat + ' — ' + proj0(x.projId), amount: x.amount, projId: x.projId, phaseId: x.phaseId }]);
    x.billId = b.id;
  }
  function proj0(pid) { return (projects.find(p => p.id === pid) || {}).num || ''; }
  const first = (k, d) => { const t = D(today); return iso(new Date(t.getFullYear(), t.getMonth() - k, d, 12)); };
  for (let k = 4; k >= 0; k--) {
    const rows = [[vendors[4], first(k, 1), 4800, 'a6000', 'Office rent'], [vendors[5], first(k, 5), 650, 'a6100', 'CAD & analysis licenses'], [vendors[6], first(k, 10), 900, 'a6200', 'Professional liability & GL'], [vendors[7], first(k, 15), Math.round(180 + rnd() * 140), 'a6300', 'Supplies']];
    for (const [v, date, amt, a, desc] of rows) if (date <= today) mkBill(v, date, [{ accountId: a, desc, amount: amt, projId: '', phaseId: '' }]);
  }
  const journals = [{ id: id('j'), num: 'JE-001', date: add(today, -125), memo: 'Opening balances', lines: [{ accountId: 'a1000', debit: 230000, credit: 0 }, { accountId: 'a1500', debit: 35000, credit: 0 }, { accountId: 'a3010', debit: 0, credit: 265000 }] }];
  const payruns = []; const pr = { wh: 22, er: 8.65 }, r2s = x => Math.round(x * 100) / 100;
  for (let k = 7; k >= 0; k--) {
    const end = add(mon, -1 - 14 * k), start = add(end, -13), payDate = add(end, 5);
    const lines = employees.filter(e => e.active).map(e => { const hours = time.filter(t => t.empId === e.id && t.date >= start && t.date <= end).reduce((s, t) => s + t.hours, 0); const gross = r2s(hours * e.cost), wh = r2s(gross * pr.wh / 100), er = r2s(gross * pr.er / 100); return { empId: e.id, hours, rate: e.cost, gross, wh, er, net: r2s(gross - wh) }; }).filter(l => l.hours > 0);
    payruns.push({ id: id('r'), num: 'PR-' + String(8 - k).padStart(3, '0'), start, end, payDate, status: payDate <= today ? 'Paid' : 'Draft', whPct: pr.wh, erPct: pr.er, lines });
  }
  const paidRuns = payruns.filter(r => r.status === 'Paid');
  paidRuns.slice(0, -1).forEach((r, i) => { const date = add(r.payDate, 9); if (date <= today) journals.push({ id: id('j'), num: 'JE-' + String(i + 2).padStart(3, '0'), date, memo: 'Remit payroll taxes — ' + r.num, lines: [{ accountId: 'a2100', debit: r2s(r.lines.reduce((s, l) => s + l.wh + l.er, 0)), credit: 0 }, { accountId: 'a1000', debit: 0, credit: r2s(r.lines.reduce((s, l) => s + l.wh + l.er, 0)) }] }); });

  return {
    v: 1,
    settings: { firm: 'Granite Ridge Civil Engineering', overhead: 150, markup: 10, terms: 30, nextInvoice: 1031 + invoices.length, theme: 'auto', payWithhold: 22, payEmployer: 8.65 },
    employees, clients, projects, time, expenses, invoices, tasks, plan, accounts, vendors, bills, payruns, journals,
  };
}
