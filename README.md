# Project Manager · Apollo Development

All-in-one project management and project accounting for a civil engineering office: projects, phases and budgets, staff and utilization, resource scheduling, timesheets, expenses, invoicing, A/R and reports.

Static web app — no build step, no server. Open `index.html` or host on GitHub Pages (the included workflow deploys on every push to `main`; set **Settings → Pages → Source** to **GitHub Actions** once).

## Modules

| Area | What it does |
| --- | --- |
| Dashboard | Backlog, unbilled WIP, A/R, utilization, profit; project health; a "needs attention" list |
| Projects | Phases with fee and hour budgets, fixed-fee or hourly not-to-exceed, % complete, earned value, projected overrun |
| Tasks | Drag-and-drop board with permit and hearing deadlines |
| Schedule | Hours per person per week, over-capacity flags, planned hours vs. budget hours left |
| Timesheets | Weekly grid by project/phase plus overhead codes, approval queue |
| Billing | Invoices built from unbilled WIP, draft → sent → paid, A/R aging, printable invoice |
| Expenses | Subconsultants and reimbursables with markup |
| Reports | Profitability, utilization, WIP, A/R aging, backlog, time detail — CSV export |

## How the numbers work

- **Spent** = labor at billing rates + billable expenses with markup
- **Earned** = fee × % complete (fixed fee) or spent (hourly)
- **WIP** = earned − invoiced
- **Profit** = earned − (direct labor × (1 + overhead rate) + expenses at cost)

## Data

Data is stored in the browser (`localStorage`). Use **Settings → Export backup** to move it between computers. The first load shows fictional demo data; **Settings → Start with a blank office** clears it.

Files: `index.html`, `style.css`, `app.js` (app), `seed.js` (demo data).
