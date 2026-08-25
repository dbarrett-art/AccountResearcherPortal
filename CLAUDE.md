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

The advisory page check is behind a switch on the preview page. It calls the Worker's
`POST /domain-check`, which fetches the domain's root URL, reads the `<title>` and meta
description, and asks Haiku whether the page presents itself as that company. It
annotates options and never picks, reorders, or blocks; a fetch or model failure reads
"couldn't check" and never a guess. Measured ~200ms–1s to fetch plus ~1s for the model,
which is why it is async and the card renders before it.

`src/pages/PreviewAccountSearch.tsx` at `/preview/account-search` is an admin-only,
unlinked review harness. It exercises the live endpoints but cannot submit a run. **Submit
still uses free-text entry** — wiring the component in is a separate task pending sign-off,
and the preview route should be removed once that lands.

`harness/` is a dev-server-only vite entry (`/AccountResearcherPortal/harness/`) that
renders the same preview body against fixtures, for screenshots. `vite build` reads the
root `index.html` and never touches it, so none of it ships.
`scripts/screenshot-domain-confirm.mjs` drives it with Puppeteer resolved out of the
prospect-research repo.

## Related Repos

- **prospect-research** — pipeline that generates the briefs this portal displays
- **cloudflare-worker** — API layer between portal and Supabase/pipeline

## Deploy

Push to `main` triggers the `deploy.yml` GitHub Actions workflow which builds and deploys to GitHub Pages. No manual deploy steps needed.
