# Deploying to Hostinger (Business Web Hosting, Node.js web app)

This guide covers deploying SmartManager E-commerce as a **Node.js web app** on Hostinger **Business** hosting, using a ZIP upload.

> Hostinger's hPanel changes over time. If a menu is named differently, look for the equivalent **Node.js web app** setting.

---

## 1. Build the ZIP

```bash
npm run package:hostinger          # → dist/smartmanager-ecommerce-<commit>.zip
```

The ZIP contains the committed source only. It excludes `node_modules`, `.next`, `.env*`, tests and CI files. Hostinger installs the dependencies and runs the build itself.

## 2. Create the Node.js web app

1. hPanel → **Websites → Add Website → Node.js web app → Upload your files**. Upload the ZIP.
2. Build settings (Hostinger normally detects Next.js; check these values):

| Setting | Value |
|---|---|
| Framework | Next.js |
| Node.js version | **22** (20.9+ works) |
| Package manager | npm |
| Build command | `npm run build` |
| Start command | `npm start` (runs `next start`, which honours Hostinger's `PORT`) |

3. Attach the **platform domain** `e-commerce.smartmanage.me` to the app.

## 3. Environment variables

Set these in the app's **Environment variables** before the first build. `NEXT_PUBLIC_*` values are compiled into the build, so **rebuild or redeploy after changing them**.

| Variable | Required | Value | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | `https://yswvehtpwmzulgkvznnb.supabase.co` | Public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | `sb_publishable_…` (Supabase → Project Settings → API Keys) | Public |
| `SUPABASE_SECRET_KEY` | ✅ | `sb_secret_…` (Supabase → API Keys → Secret keys) | **Secret.** Server-only. Needed for invitation sign-up and domain verification. |
| `PLATFORM_ROOT_DOMAIN` | ✅ | `e-commerce.smartmanage.me` | |
| `CONSOLE_SUBDOMAIN` | ✅ | `app` | Admin console at `app.e-commerce.smartmanage.me` |
| `PUBLIC_URL_SCHEME` | ✅ | `https` | |
| `STOREFRONT_DNS_TARGET` | recommended | The IP/hostname Hostinger shows for the app | Shown to tenants in their custom-domain DNS instructions |
| `NODE_ENV` | — | `production` | Usually set by Hostinger |

Never put `SUPABASE_SECRET_KEY` in a file inside the ZIP.

## 4. Domains and SSL

Hostinger Business hosting has **no wildcard SSL** (wildcards are VPS-only). Every hostname that serves the app is therefore added to the Node.js app once, and Hostinger issues its SSL certificate:

| Hostname | When | DNS |
|---|---|---|
| `e-commerce.smartmanage.me` | once | A record → app IP (or as hPanel instructs) |
| `app.e-commerce.smartmanage.me` | once | A record → app IP |
| `<slug>.e-commerce.smartmanage.me` | **per new business** | A record → app IP |
| a business's own domain (e.g. `roasters.com`) | when the business adds one | Set by the business at their registrar: TXT verification record + A/CNAME to `STOREFRONT_DNS_TARGET` |

**Onboarding a business (Super Admin checklist)**

1. Console → Platform administration → **New business**. Send the owner invitation link.
2. In hPanel, add `<slug>.e-commerce.smartmanage.me` to the Node.js app (DNS A record + SSL).
3. When the business adds a custom domain, the owner verifies it (DNS TXT) in **Settings → Domains**. It then appears as **DNS verified** on the business page in Super Admin. Add it in hPanel, then click **Mark as connected**.
4. Set the business status to **Active** when it is ready to go live.

The app never serves one business's data on another business's hostname: unknown hostnames return 404, and custom domains resolve only after DNS verification.

## 5. Supabase configuration

In the Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://app.e-commerce.smartmanage.me`
- **Redirect URLs:** `https://app.e-commerce.smartmanage.me/**`

Database migrations are in `supabase/migrations/` and are applied to the project before deploying app code that depends on them.

## 6. Updating

1. Commit, then run `npm run package:hostinger`.
2. Upload the new ZIP to the same Node.js app (redeploy). Hostinger rebuilds and restarts.
3. Health check: `https://app.e-commerce.smartmanage.me/api/health` → `{"status":"ok"}`.

## 7. Known limits of Business hosting

- **Adding hostnames is manual** (see §4). For fully automatic custom domains, move to a VPS with on-demand TLS; the application needs no changes for that.
- **Image optimisation** (`next/image`) runs in the Node process and caches on the app's disk.
- **Background jobs** (Phase 7+: notifications, daily brief, retention) will run from Supabase `pg_cron`, or from a Hostinger cron job calling a protected endpoint. Nothing runs in the background yet.
