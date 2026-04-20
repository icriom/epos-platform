# Helm EPoS — Developer Crib Sheet

_Last updated: end of Session 10_

## Purpose & context

Sean is the owner/developer of **Helm**, a proprietary hospitality EPoS platform being built primarily for The Harbour Inn in Douglas, Isle of Man, with planned UK expansion. Sean co-owns the underlying hospitality technology business with a partner (Amy), bringing significant industry experience to the product vision. He has limited coding knowledge and relies on Claude as his **primary and proactive lead developer** — Claude is expected to flag risks and recommend approaches *before* problems arise, not after.

The platform targets the Isle of Man market first, with a tiered product strategy:

- **Essentials** — counter service
- **Professional** — table management
- **Premium** — full feature set

Pricing tiers are set at £79 / £129 / £199 per month. The product competes against offerings like Tapldoo (a payments-first product resold locally by Ripple on the Island), with Helm differentiated by hospitality depth, native IoM presence, and planned AI/natural language ordering capabilities.

## Current state

The project (`epos-platform`, github.com/icriom/epos-platform) is a React Native monorepo at `~/epos-platform` with:

- `apps/api` — Fastify / Prisma / PostgreSQL backend
- `apps/pos` — Expo-based POS app
- `apps/backoffice` and `apps/kds` — scaffolded, not yet active

The app is running in **Expo Go** on the physical **iMin D4-503** Android terminal (connected via AnyDesk at 192.168.199.155). A local development build APK approach was attempted and abandoned after cascading build failures (Kotlin/Gradle/SDK/monorepo hoisting conflicts); Expo Go is the confirmed working path.

**Completed and confirmed working features:**

- PIN login with staff profiles (JWT auth, bcrypt PIN hashing)
- Manager-specific PIN auth for elevated actions (Session 9)
- Table plan screen with live colour-coded table status
- Walk-in order flow
- Item action modal (add, remove, void with quantity consolidation)
- Cancel sale
- Full payment screen: Cash, Card, Split by covers
- Payment success screen with countdown return to till
- Table tracking: Store Table, reopening existing table orders, balance banners
- Partial payment by item and by custom amount
- Multi-quantity line expansion in by-item partial selector (e.g. 3× Guinness shown as three individually-selectable rows "1 of 3", "2 of 3", "3 of 3")
- Kitchen fire tracking, customer numbers, sent-item warnings, audit trail
- Add-one on a sent line creates a new line rather than incrementing the sent one
- Z-Read / End of Day report with date range toggle, VAT breakdown, payment/staff/item analysis (manager area)

**No known outstanding bugs.** Session 10 closed with clean main, working tree clean, verified end-to-end on iMin.

## On the horizon

Ordered by recommended priority for next session:

1. **Configurable API base URL** (small, ~20 min task) — support emulator (`10.0.2.2`) and iMin (`192.168.199.216`) simultaneously without hand-editing `apps/pos/src/services/api.ts`
2. **Receipt printing via the iMin D4-503's built-in thermal printer** — next meaty feature; unlocks Essentials tier as genuinely deployable. Needs research into iMin's printer SDK (Android intent or vendor lib), careful attention to character encoding for £ and special characters, paper width config
3. **Barcode scanning via a Honeywell Orbit scanner** (keyboard-input mode, carriage return suffix)
4. **KDS (Kitchen Display System)** development — `apps/kds` is scaffolded but inactive
5. **Back-office reporting** — `apps/backoffice` expansion beyond the in-till Z-Read
6. **AI / natural language ordering features** — Anthropic Claude API identified as the integration
7. **Payment processing integrations:** StringIQ, Swipen (SoftPoS)

## Key learnings & principles

- **Claude must be proactive, not reactive.** Sean has explicitly stated that "what I should have done earlier" is not acceptable — decisions should be made correctly at the time. Flag risks upfront.
- **Expo Go is the stable test path.** Local dev build APKs have caused repeated cascading failures and should not be attempted again without careful pre-assessment of SDK, Kotlin, Gradle, and monorepo compatibility.
- **Monorepo hoisting is a persistent risk.** Root `node_modules` can bleed packages across apps with different SDK versions; treat dependency changes carefully.
- **VS Code must be opened from `apps/api`**, not the repo root, for module resolution to work correctly. `apps/pos` is added via File → Add Folder to Workspace.
- **Windows port proxies are required after every PC reboot** — ports 8081 and 3000 must be proxied from the PC's network IP (192.168.199.216) to the WSL IP (typically 172.29.18.11) using `netsh interface portproxy`.
- The emulator uses `10.0.2.2` as localhost; the iMin uses the PC's network IP (`192.168.199.216`).
- **Prisma 5** is in use — Prisma 7 introduced breaking changes that required downgrading.
- Schema and file edits should be done in VS Code directly, not via terminal `cat` commands (caused schema corruption previously).
- **Eyeball `git diff --stat HEAD` before every commit.** A single file showing a churn dramatically larger than the commit's apparent scope (e.g. a 900-line delta on a file you only meant to tweak) is the fingerprint of an accidental file overwrite — usually "save as wrong file" or bad copy-paste. Takes 15 seconds, catches the issue at source rather than days later when nodemon reloads the broken file. (Learned the hard way in Session 10: Session 9 Step 1 silently overwrote 828 lines of orders route with auth code; not detected until a later nodemon reload.)
- **Nodemon caches old modules in memory.** Broken files on disk may not surface until the API is restarted. Don't assume "the till is working right now" means "the code on disk is intact" — trust `git diff`, not runtime behaviour, when verifying file integrity.
- **Keep the crib sheet current.** Outstanding-bug notes that have been silently fixed in earlier sessions can cause wasted investigation next session. When a fix lands, strike it from the horizon list at the same time.

## Approach & patterns

- Sean strongly prefers receiving **complete replacement files to download** rather than inline code edits or diff patches.
- Direct confirmation flows are preferred over intermediate Alert dialogs, particularly for payment actions on Android.
- Development is session-based with git commits at the end of each session; known issues and pending tasks are tracked in this crib sheet.
- Git checkouts of specific commits have been used to recover stable states when builds break. See "Recovery recipes" below for the canonical single-file restore.

## Tools & resources

- **Hardware:** Windows 11 Pro desktop (dual monitors), iMin D4-503 (primary test terminal), iMin D2-402 (available), Honeywell Orbit barcode scanner
- **Dev environment:** WSL2 / Ubuntu 24.04, VS Code, Node.js v24 via NVM, Docker Desktop (PostgreSQL 16, Redis 7), Android Studio (virtual tablet emulator), AnyDesk (remote into iMin)
- **Stack:** React Native / Expo (TypeScript), Fastify, Prisma, PostgreSQL, Zustand (state), React Navigation, nodemon (API hot reload)
- **Key file locations:**
  - `apps/pos/src/screens/pos/OrderScreen.tsx`
  - `apps/pos/src/screens/pos/PaymentScreen.tsx`
  - `apps/pos/src/screens/pos/TablePlanScreen.tsx`
  - `apps/pos/src/screens/reports/ReportsScreen.tsx`
  - `apps/pos/src/screens/reports/ZReadScreen.tsx`
  - `apps/pos/src/components/ManagerPinModal.tsx`
  - `apps/api/src/routes/orders/index.ts`
  - `apps/api/src/routes/auth/index.ts`
  - `apps/pos/src/services/api.ts`
  - `apps/api/prisma/schema.prisma`
- **Test venue:** The Harbour Inn, Douglas, IoM — with staff (Sean / Manager, Amy, Tom, Sarah), full menu with categories and items, active trading sessions and orders
- **Competitive intelligence:** Tapldoo (MWBS / Ripple on the Island) assessed and found to be payments-first with thin hospitality features — not a deep competitor on feature depth

### Recovery recipes

**Single-file restore from a known-good commit** — when a file gets corrupted (accidental overwrite, bad save-as, cross-contamination in a multi-file commit):

```bash
# 1. Survey the damage before touching anything
git status
git diff <good-commit-sha> -- <path/to/file> | head -40
git log --oneline <good-commit-sha>..HEAD

# 2. Confirm only one file is affected and which commit introduced it
git log --oneline <good-commit-sha>..HEAD -- <path/to/file>
git show --stat <suspect-commit-sha>

# 3. Confirm schema hasn't drifted (if restoring a backend route)
git diff <good-commit-sha> -- apps/api/prisma/schema.prisma | head -60

# 4. Restore — pulls only that file, auto-stages
git checkout <good-commit-sha> -- <path/to/file>

# 5. Verify the restore
wc -l <path/to/file>
grep -c "fastify\." <path/to/file>   # for routes; use a file-appropriate marker otherwise
git status

# 6. Smoke test end-to-end BEFORE committing
# (nodemon will auto-reload; run full user flow on iMin)

# 7. Commit with a clear message citing both the good commit and the bad one
git commit -m "Restore <file> from <good-sha> - accidentally overwritten in <bad-sha>. <verification note>."
git push origin main
```

Precedent: Session 10 restored `apps/api/src/routes/orders/index.ts` from `bde836b` (Session 8 complete) after it was overwritten by `3af32b2` (Session 9 Step 1). Committed as `a03d3a2`.
