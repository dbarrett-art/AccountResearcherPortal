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
book via the Worker's `GET /account-search`. Selecting a candidate locks the submission
to that account's domain + Salesforce ID, replacing free-text company entry (which the
pipeline used to re-match later, sometimes onto a different company).

`src/pages/PreviewAccountSearch.tsx` at `/preview/account-search` is an admin-only,
unlinked review harness. It exercises the live endpoint but cannot submit a run. **Submit
still uses free-text entry** — wiring the component in is a separate task pending sign-off,
and the preview route should be removed once that lands.

## Related Repos

- **prospect-research** — pipeline that generates the briefs this portal displays
- **cloudflare-worker** — API layer between portal and Supabase/pipeline

## Deploy

Push to `main` triggers the `deploy.yml` GitHub Actions workflow which builds and deploys to GitHub Pages. No manual deploy steps needed.
