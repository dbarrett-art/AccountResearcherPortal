# AccountResearcherPortal

React SPA for Figma AEs to submit account research requests, view briefs, and manage territory. Deployed to GitHub Pages at `/AccountResearcherPortal/`.

**Owner:** Dan Barrett (Figma)
**Users:** Figma enterprise AEs

---

## Tech Stack

- React 19 + TypeScript 5.9 + Vite 8
- Tailwind CSS 3.4 for styling
- Supabase (auth + database + storage)
- GitHub Pages deployment (push to main auto-deploys)

## Commands

```bash
npm run dev          # Local dev server
npm run build        # tsc -b && vite build
npx tsc --noEmit     # Type check only
npm run lint         # ESLint
```

## Key Conventions

- **Lucide icons:** Do NOT add new `lucide-react` imports — reuse icons already imported across the codebase. Check existing imports before adding any icon.
- **Single-file components** preferred — colocate logic, markup, and styles.
- **Supabase client** via `src/lib/supabase.ts`, auth state via `src/context/AuthContext.tsx`.
- **Theme** via `src/context/ThemeContext.tsx` (light/dark mode).
- **Status polling** via `src/context/StatusContext.tsx` for pipeline run status.
- **Protected routes** via `src/components/ProtectedRoute.tsx`.
- **Routing is `BrowserRouter`** with `basename="/AccountResearcherPortal"` (see `src/main.tsx`) — routes are real paths, not hashes. Deep links rely on the `public/404.html` `?path=` shim on GitHub Pages.
- **Worker base URL** defaults to production; set `VITE_WORKER_BASE` to point `npm run dev` at a local `wrangler dev` Worker (needed to exercise an endpoint that is not deployed yet).
- **Base path** is `/AccountResearcherPortal/` — configured in `vite.config.ts`.

## Key Directories

| Path | Purpose |
|------|---------|
| `src/pages/` | Route-level page components (Submit, MyBriefs, BriefView, Territory, Admin, etc.) |
| `src/components/` | Shared UI components (Layout, Sidebar, StatusBadge, etc.) |
| `src/context/` | React context providers (Auth, Theme, Status) |
| `src/hooks/` | Custom hooks (useWindowWidth, usePageTitle) |
| `src/lib/` | Supabase client config |

## Type-ahead account picker

`src/components/AccountSearch.tsx` — self-contained type-ahead over the real whitespace
book via the Worker's `GET /account-search`. It asks two questions in order:

1. **Which account.** Picking a candidate locks the submission to that account's
   Salesforce ID, replacing free-text company entry (which the pipeline used to re-match
   later, sometimes onto a different company).
2. **Which domain.** A separate, explicit confirm step, taken for every account
   including one holding a single domain. The selection comes back with
   `domain_confirmed: false` and every domain on the record ranked; a host must treat
   that as an incomplete request. The domain used to be settled silently as
   `primary_domain` — the first entry in the `DOMAINS__C` cell — and 1,010 accounts had
   it pointing somewhere Salesforce does not consider theirs.

`src/lib/domain-rank.ts` ranks the options: apex over subdomain when both are on the
record, then a domain label matching the account name, then the record's own order. It is
deliberately free of any public-suffix list (a relative suffix comparison instead), so the
portal does not become a third copy of `apexDomain`. Tests in `domain-rank.test.ts` assert
the named accounts — Entur, Nets, LVMH, HSBC, Toyota.

The account card shows eight fields off the `whitespace_accounts` row, laid out by kind
rather than as one muted line: the owner and a link into Salesforce under the name (owner
is identity, and it is what catches a wrong account at a glance); segment, region and
employees as chips (categorical); ARR, total whitespace, full seats and dev seats as a
four-across metric row (measured). Four is the limit at 560px — a fifth wraps.
`src/lib/account-format.ts` renders **`—` for null and the figure for zero**, which is
load-bearing: `employees` is null on 1,251 of 20,963 active accounts and
`total_whitespace` on 3,026, while `full_seats` is genuinely zero on 16,116, and
collapsing those says Figma measured an account nobody has measured.

Nothing on the card sits on `--text-tertiary`. That token is the app's placeholder and
caption colour — 2.66:1 against the light card surface — and it was carrying the four
figures an AE is meant to act on plus the name of the person whose book the account is in.
Labels and the owner line are `--text-secondary` at 500 (5.90:1 light, 5.11:1 dark), metric
values are 16px 500 `--text-primary`, and chips are unfilled: `1px solid var(--chip-border)`
with `--text-primary` text, segment keeping its `--accent-subtle` tint. `--chip-border`
resolves to `--border-strong` in dark and `--border` in light, because on a chip whose
border IS the chip, dark `--border` composites to 1.25:1 against `#1a1a1a` and reads as an
absent edge. The measurements are in `src/index.css` above the token.

`src/lib/salesforce-url.ts` builds the record link:
`https://figma.lightning.force.com/lightning/r/Account/<id>/view`. Both halves were
established against the live org, not assumed — `User.FullPhotoUrl` is
`https://figma.file.force.com/...`, which fixes My Domain as `figma`, and an
unauthenticated GET of that path 302s to
`figma.my.salesforce.com/visualforce/session?url=<the same path>`, the Lightning session
bootstrap. It accepts 15- and 18-char IDs (the two tables behind the export disagree) and
returns **null** for anything that is not an Account ID, in which case the card falls back
to printing the raw ID. The ID is on the link's `title` so it stays copyable.

Tokens come from `src/index.css` and Submit: 13px text, 6px radius on fields and buttons,
8px on panels, 600 for headings and 500 elsewhere. `var(--accent)` marks a **selected
item** and nothing else — the chosen domain row, the same treatment as `Territory.tsx`'s
FilterChip and `PipelineDebug.tsx`'s selected module tile. It is deliberately *not* on
any container; an accent border round the domain block was what made it read as bolted on.
The app is dark-first (`--bg-app: #0f0f0f` is `:root`, light is the `[data-theme]`
override), so check dark first. `--badge-muted-bg` is one step from `--bg-surface` in light
theme (`#f5f5f0` on `#f5f4f0`) and a chip filled with it has no visible edge at all; the
`couldn't check` verdict chip was the last thing still doing that and is now a hairline
too. Prefer an unfilled chip to picking a fill that nearly collides.

The advisory page check is **on by default**. It calls the Worker's `POST /domain-check`,
which fetches the domain's root URL, reads the `<title>` and meta description, and asks
Haiku whether the page presents itself as that company. It annotates options and never
picks, reorders, or blocks; a fetch or model failure reads "couldn't check" and never a
guess. Verdicts read `<Account>'s site` / `different company` / `not a website` /
`couldn't check` — "looks right" was a fair hedge for something you switched on and
overclaims as a default. The one-line reason is dropped when it is identical across every
option (Entur returns the same sentence for both of its domains) and kept where it
distinguishes one.

Measured: five domains in parallel resolve in 1.2–1.8s (Worker repo's
`scripts/measure-domain-check-latency.mjs`), and the card plus domain list paint at a
median 24ms with `checking…` per row resolving in place
(`scripts/measure-card-render.mjs`, which also asserts the confirm button is enabled and
the radio still moves while the check is in flight). Its off-switch is in **Admin →
Preview** (`src/lib/preview-settings.ts`, localStorage) so noise can be turned off
without a deploy — per browser, which is enough while the only route that reads it is
admin-only and one of 194 users is an admin.

`src/pages/PreviewAccountSearch.tsx` at `/preview/account-search` is an admin-only,
unlinked review harness. It exercises the live endpoints but cannot submit a run. **Submit
still uses free-text entry** — wiring the component in is a separate task pending sign-off,
and the preview route should be removed once that lands.

It no longer has a "What happens next" panel. That went from pretty-printed JSON to four
rows of prose to deleted (2026-08-26), the last step off a live review: the domain, the
name and the owner are all on the card above it, and the unconfirmed state is communicated
by the Confirm button existing, so the panel and its `incomplete — domain not confirmed`
chip were restating the card. The raw payload is still there, collapsed behind a
disclosure, and is now the only thing in that panel — a debugging affordance for whoever is
changing the code.

Two of those four rows were not duplicates and went with it: that the confirmed domain is
also the email domain Apollo filters contacts on, and that the figures are a Sigma export
loaded on a date (`loaded_at`, never hardcoded) — the answer to "why does this differ from
Salesforce". Neither is on screen anywhere now. If either is missed, it belongs on the
card, not in a second panel restating it.

`harness/` is a dev-server-only vite entry (`/AccountResearcherPortal/harness/`) that
renders the same preview body against fixtures, for screenshots. `vite build` reads the
root `index.html` and never touches it, so none of it ships.
`scripts/screenshot-domain-confirm.mjs` drives it with Puppeteer resolved out of the
prospect-research repo, **dark theme first**. Every fixture is a real account read off
`whitespace_accounts` at load 11, including the edges the card has to survive: no
Salesforce `Website` (Maersk Supply Service), null `employees` and `total_whitespace`
(Ministério das Finanças Angola), and no domain at all (Roblox).

## Related Repos

- **prospect-research** — pipeline that generates the briefs this portal displays
- **cloudflare-worker** — API layer between portal and Supabase/pipeline

## Deploy

Push to `main` triggers the `deploy.yml` GitHub Actions workflow which builds and deploys to GitHub Pages. No manual deploy steps needed.
