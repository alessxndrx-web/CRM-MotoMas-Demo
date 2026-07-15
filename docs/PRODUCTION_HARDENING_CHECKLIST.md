# MotoMas — Production hardening & deployment checklist (Patch 3.7E)

Deployment-readiness reference for the MotoMas Centro de Operaciones after the
PostgreSQL migration. It documents required configuration, safe commands and QA.
It introduces **no** business logic and changes **no** workflows — it records how
to deploy and verify what already exists.

> Scope note: this is a checklist. It does not add features, does not reset the
> database, and does not recommend any destructive command as a default.

---

## 1. Pre-deploy checklist

- [ ] Reachable PostgreSQL instance provisioned (own database + user).
- [ ] `.env` created from `.env.example` with real values (never committed).
- [ ] `SESSION_SECRET` is a long random value, **identical across all instances**.
- [ ] All migration/hardening flags left OFF (see §3).
- [ ] `pg_dump` backup taken of any pre-existing data (see §8).
- [ ] `npm install` completed on the target Node.js runtime.
- [ ] `npx prisma migrate status` reports "Database schema is up to date".
- [ ] Bootstrap Admin credentials prepared (see §6) if no Admin exists yet.
- [ ] Build succeeds and the smoke checks in §9/§10 pass.

---

## 2. Required environment variables

Defined in `.env` (see `.env.example` for the authoritative, commented list).

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Prisma. |
| `SESSION_SECRET` | Yes (prod) | HMAC-SHA256 key that signs the auth session cookie. Must match across instances. **Enforced since Patch 3.8B**: under `NODE_ENV=production` the server throws if it is missing. The built-in development key is used only outside production. |
| `MOTOMAS_ADMIN_NAME` / `MOTOMAS_ADMIN_EMAIL` / `MOTOMAS_ADMIN_PASSWORD` | Only for first seed | Bootstrap Admin created by the seed if no Admin exists. Password ≥ 8 chars. |
| `AUTH_DEV_FALLBACK` | No | Enables built-in dev login accounts only when `DATABASE_URL` is unset and outside production. Leave unset in prod. |
| `NEXT_PUBLIC_MOTOMAS_ENABLE_DEMO_DATA` | No | Synthetic local demo records for localStorage readers. Leave `false`/unset in prod. |
| `NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS` | No | Developer-only technical/migration wording. **Off in prod.** |
| `NEXT_PUBLIC_ENABLE_LEGACY_OPERATIONAL_PANELS` | No | Re-renders legacy localStorage panels. **Off in prod.** |
| `NEXT_PUBLIC_ENABLE_DEMO_DATA_RESET` | No | Destructive browser-only demo reset control. **Off in prod.** |

Do not print or commit secrets. `.env` must stay out of source control.

---

## 3. Feature flags — required production defaults

Source of truth: `src/shared/feature-flags.ts`. All flags are **opt-in** and
default to safe/off. Verified defaults:

| Flag | Prod value | Effect when OFF (default) |
|---|---|---|
| `NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS` | unset / `false` | No technical/migration wording; business copy only. |
| `NEXT_PUBLIC_ENABLE_LEGACY_OPERATIONAL_PANELS` | unset / `false` | Legacy localStorage panels hidden when PostgreSQL is available; only DB-backed data renders. `LegacySectionDivider` does not appear. |
| `NEXT_PUBLIC_ENABLE_DEMO_DATA_RESET` | unset / `false` | Destructive Settings reset control hidden. |
| `NEXT_PUBLIC_MOTOMAS_ENABLE_DEMO_DATA` | unset / `false` | No synthetic local demo records. |

With PostgreSQL configured and these flags off, there is **no DB/local dual
operation**: DB panels are primary and the legacy fallback stays gated (a
localStorage fallback surfaces only if the database is unreachable).

**Must remain disabled in production:** all four flags above and any bootstrap
that would re-enable the demo reset or the legacy panels.

---

## 4. Auth & protected routing (verified)

- `/panel/:path*` is guarded at the edge by `src/proxy.ts`, which verifies the
  signed session cookie and redirects unauthenticated requests to `/login`.
- The operations layout additionally requires a server session
  (`getCurrentUserSession`) and redirects when absent.
- `loginAction` sets an **httpOnly**, `sameSite=lax`, `secure` (in production)
  cookie with an 8h TTL; `logoutAction` deletes it. The client shell also clears
  its UI mirror on logout.
- **Production will not run without `SESSION_SECRET`** (Patch 3.8B): `getSecret()`
  in `src/server/auth/session.ts` throws under `NODE_ENV=production` when the
  variable is unset, so no cookie can be signed or verified with the public
  development key. Sign-in and `/panel/*` verification fail loudly instead of
  accepting forgeable sessions. The development fallback key remains available
  only outside production, for local work. The secret is never logged or printed.
- Data access is enforced server-side in every query/action via `requireAuth`
  plus the pure `canX` predicates in `src/server/auth/access.ts` — never by the
  client.
- `SessionBridge` / `motomas-demo-session-v1` are **UI-compatibility mirrors
  only** (class C in `docs/LOCALSTORAGE_AUDIT.md`); no server action, route guard
  or data scope reads them for authorization. Do not remove yet — retire once
  every shell reads the authenticated server session (future patch).

Confirmed by the Patch 3.7D smoke test (131/131): unauthenticated `/panel/*`
redirects to `/login`; role scope cannot be widened by client manipulation.

---

## 5. Public route security (verified)

- Public tracking (`/consultar-expediente`, `/mi-credito`, `/mi-reserva`,
  `/mi-entrega`) requires a public code **plus** a matching phone/cédula on the
  DB path; the local fallback demands the same verification and masks the phone.
- Not-found stays generic; no code-only lookup.
- Public DTOs expose no internal IDs, notes, costs, Caja/Contabilidad data, or
  motorcycle unit identifiers (VIN/chassis/engine); no raw Prisma record is
  serialized.
- `/solicitar-informacion` remains compatible: it captures `campaignId`/UTM from
  the query string (DB attribution), with a cosmetic local `campaignName`
  fallback; the public submission flow and its security are unchanged.

Do not change public tracking behavior except to fix a clear security bug.

---

## 6. Database migration & seed procedure

Production migration (non-destructive — applies pending migrations only):

```
npm install
npx prisma generate
npx prisma migrate deploy      # NOT "migrate dev" in production
npx prisma migrate status      # expect: "Database schema is up to date"
```

Convenience scripts (added in 3.7E, non-destructive):
`npm run prisma:deploy`, `npm run prisma:status`.

**Never** run `prisma migrate reset` / `prisma db push --force-reset` against a
production database — they drop data. There is no such script in `package.json`.

### Seed policy (`prisma/seed.mjs`)

- **Idempotent**: upserts real branches and the motorcycle catalog by unique key;
  running it repeatedly is safe.
- Creates **one** bootstrap Admin **only** when `MOTOMAS_ADMIN_*` are all set; if
  any is missing it warns and creates nothing.
- Does **not** create demo users, fake physical inventory, or transactional data.
- Warns (never deletes) if legacy `CH-DEMO-*` units or the five
  `*@motomas.local` development users are present — clean those up manually
  before go-live.
- **Safe to run**: on first provisioning, or to (re)assert branches/catalog.
  **Do not run** expecting demo/operational data — there is none by design.

---

## 7. Build & run

```
npm install
npx prisma generate
npm run build        # (Windows dev shell: npm.cmd run build)
npm run start        # serves the production build
```

`next.config.ts` keeps `@prisma/client`/`prisma` as server-external packages so
the query engine loads from `node_modules` at runtime — ensure `node_modules` is
present on the server (do not prune Prisma).

---

## 8. Backup / restore recommendations

- **Before every deploy**: `pg_dump` a full logical backup, e.g.
  `pg_dump "$DATABASE_URL" -Fc -f motomas_$(date +%F_%H%M).dump`.
- **Scheduled backups**: nightly `pg_dump` via cron; keep a rolling retention
  (e.g. 7 daily + 4 weekly + 3 monthly).
- **Off-server copy**: replicate dumps to separate storage/host.
- **Restore rehearsal**: periodically restore a dump into a scratch database
  (`pg_restore`) to confirm backups are usable.
- **Power loss / UPS**: put the DB host behind a UPS; enable clean shutdown so a
  power cut does not corrupt the cluster.
- **Retention policy**: document and enforce how long dumps are kept and who can
  restore them.

Backup scripting is an ops responsibility; none is added to the repo here.

---

## 9. Migration verification commands

```
npx prisma generate
npx prisma migrate status
npx tsc --noEmit
npx eslint
npm run build
```

Full-repo `npx eslint` reports a pre-existing, unrelated baseline of
errors/warnings; the migrated analytics/marketing modules, DB panels and their
routes are clean. Treat that baseline as known, not a deploy blocker.

---

## 10. Manual QA checklist by role

Sign in as each seeded/real user and confirm:

- **Admin** — global dashboard (branch + seller performance + alerts); all
  commercial, Caja and Contabilidad routes reachable; Reportes/Marketing show
  full content. No legacy panel, no technical wording.
- **Gerente** — branch-scoped dashboard/leads/expedientes/activities/inventory/
  reservations/sales; seller performance for own branch; Reportes branch scope;
  Marketing read-only (own-branch + company-wide, no create/edit); Contabilidad
  limited to allowed branch read-only. Cannot widen branch via filters/URLs.
- **Vendedor** — personal dashboard and assigned leads/activities/expedientes;
  reservations/sales per rules; **no** Caja, Contabilidad, global Reportes,
  Marketing management, other-seller data or costs.
- **Cajero** — Caja only (`/panel/caja` + facturación/recibos/notas/cierres per
  rules); redirected/blocked from commercial and Contabilidad; no costs beyond
  allowed Caja fields; no commercial analytics.
- **Contador** — Contabilidad only; blocked from Caja operations, commercial
  analytics, Marketing and commercial customer operations.

---

## 11. Public portal QA checklist

- `/`, `/catalogo`, `/motocicletas/[slug]` render (200) with catalog data only.
- `/solicitar-informacion` submits a public lead; `campaignId`/UTM preserved.
- `/consultar-expediente`, `/mi-credito`, `/mi-reserva`, `/mi-entrega` require
  code + phone/cédula; masked phone; no internal IDs/notes/costs/VIN leaked.
- No technical/migration wording anywhere by default.

---

## 12. Rollback notes

- **App rollback**: redeploy the previous build artifact/commit. The DB schema is
  backward-tolerant within a release; avoid rolling back across a migration that
  dropped/renamed columns without a matching DB restore.
- **DB rollback**: restore the pre-deploy `pg_dump` into the database (planned
  downtime). Do not hand-edit `_prisma_migrations`.
- Keep the previous build + its matching pre-deploy dump paired so they can be
  restored together.

---

## 13. Server notes (Ubuntu + PostgreSQL)

- Node.js LTS matching the project; PostgreSQL 14+.
- Run the app behind a reverse proxy (nginx) terminating TLS; forward to
  `next start` (default port). `secure` cookies require HTTPS in production.
- Dedicated DB role with least privilege on the MotoMas database only.
- Firewall the DB port; do not expose PostgreSQL publicly.
- Process manager (systemd/pm2) with restart-on-failure and log capture.
- Monitor disk (for dumps/WAL) and set up log rotation.

---

## 14. Remaining hardening (future)

- Retire functional use of `SessionBridge`/`demoSession` once every shell reads
  the authenticated server session (then reclassify the class-C key).
- Evaluate gating/retiring the migrated local operational keys (class B) and the
  marketing key once each surface is fully DB-only.
- Add a public-safe DB campaign lookup for `/solicitar-informacion` to drop the
  local `campaignName` fallback.
- Optional: security response headers (CSP, HSTS, X-Frame-Options) at the proxy.
