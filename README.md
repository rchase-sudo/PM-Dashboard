# Project Manager — Apollo Development

All-in-one project management, budgeting and lite accounting for civil engineering offices. Static web app (no build) + Supabase for login, multi-user sync and roles.

**Live:** https://rchase-sudo.github.io/PM-Dashboard/ (Settings → Pages → Source: GitHub Actions)

## What's in it
- **Operations:** dashboard, projects (phases, budgets, WIP, burn), timesheets, expenses, tasks, resource plan, clients, staff, reports.
- **Billing:** invoices from unbilled time/expenses, A/R aging.
- **Books (lite, Ajera-style):** chart of accounts + derived general ledger, payables (vendors, bills with project job-costing, payments), payroll runs (estimate, posts to ledger), financials (income statement, balance sheet, trial balance, CSV).
- **Multi-user:** email/password accounts, firms with join codes, roles (admin, manager, accounting, staff) enforced by Postgres row-level security. Realtime sync between users.
- **Demo mode:** works with no account, data stays in the browser.

## Roles
| Role | Access |
|---|---|
| admin | everything, team management |
| manager | projects, clients, tasks, plan, billing, time/expenses |
| accounting | books, invoices, expenses, time |
| staff | own timesheet and tasks; read-only on projects |

## Setup
1. Supabase project with the schema (firms, members, records + RLS + RPCs); put URL and publishable key in `config.js`.
2. Auth → URL Configuration: set Site URL to the Pages URL. Decide whether Confirm email is on.
3. GitHub Pages: Source = GitHub Actions.

## Limits
Payroll is an estimate (no tax tables or filing). No bank reconciliation. Staff can see billing rates in project data.
