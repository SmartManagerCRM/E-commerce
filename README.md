# SmartManager E-commerce

A multi-tenant SaaS e-commerce platform (storefront, ordering, booking, loyalty and analytics) for cafés, restaurants, retail, beauty and other businesses. One codebase serves many independent businesses, and Postgres Row Level Security isolates each tenant's data.

- **Languages:** English, French, Arabic (full RTL)
- **Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · next-intl · Supabase (Postgres, Auth, Storage) · Hostinger (Node.js)
- **Architecture, ERD and security model:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Design system:** [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md)

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Audit & architecture | ✅ Approved |
| 1 | Foundation: tenancy schema, RLS, tenant resolver, i18n/RTL, design tokens, storefront & admin shells | ✅ Complete |
| 2 | Multi-tenancy management: create businesses, settings, branding, staff invitations, custom domains, Super Admin | ✅ Complete |
| 3 | Storefront design system: 5 themes, customisation, homepage builder, commerce components, SEO | ✅ Complete |
| 4+ | Products & inventory, checkout, payments… | Not started |

## Local development

Requirements: Node.js ≥ 20.9, Docker.

```bash
npm install
npm run db:start            # local Supabase stack: applies migrations + dev seed
cp .env.example .env.local  # then fill in the local keys printed by `npx supabase status`
                            # and set PLATFORM_ROOT_DOMAIN=localhost, PUBLIC_URL_SCHEME=http, PUBLIC_URL_PORT=3000

# staff accounts (no passwords are stored in the repo)
npm run dev:user -- --email owner@roasters.test --tenant roasters
npm run dev:user -- --email you@example.com --platform-admin

npm run dev
```

| URL | What |
|---|---|
| http://roasters.localhost:3000 | Tenant A storefront (café, Arabic default, Professional plan) |
| http://coffeehouse.localhost:3000 | Tenant B storefront (retail, French default, Starter plan) |
| http://app.localhost:3000 | Admin console (sign in) and Super Admin at `/<locale>/platform` |
| http://localhost:3000 | Platform site |

## Quality checks

```bash
npm run typecheck   # next typegen + tsc
npm run lint        # eslint, zero warnings
npm test            # unit tests (Vitest)
npm run test:db     # RLS / cross-tenant isolation tests (pgTAP) against the local stack
npm run build && npm run test:e2e   # Playwright: desktop + mobile, RTL, accessibility (axe)
```

## Environment variables

See [`.env.example`](.env.example). `SUPABASE_SECRET_KEY` is server-only: it is read only by modules guarded with `server-only` and is never sent to the browser.

## Production (Hostinger Business)

```bash
npm run package:hostinger   # → dist/smartmanager-ecommerce-<commit>.zip
```

Upload the ZIP as a Node.js web app and set the environment variables in hPanel. The full guide, including domains, SSL and Supabase settings, is in [`docs/DEPLOYMENT-HOSTINGER.md`](docs/DEPLOYMENT-HOSTINGER.md).
