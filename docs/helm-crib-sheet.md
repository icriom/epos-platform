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

The app runs on the physical iMin D4-503 Android terminal (connected via AnyDesk at 192.168.199.155). The primary development target is now an EAS-built development client APK, not Expo Go — Expo Go remains available as a fallback for non-native-module work but cannot load the app once native deps like the iMin printer SDK are present. A local development build APK approach (running Gradle on the Windows/WSL machine) was tried previously and abandoned after cascading build failures; EAS Build runs in Expo's cloud and avoids those entirely.

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
- EAS Build infrastructure: project linked (cbcb31d8-bb64-486b-ac34-521a71025f4a), eas.json with development, preview, and production profiles, expo-dev-client installed

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

- **Never hand out full-file replacements for config files without checking what's currently there.** app.json got accidentally cleared of its EAS project ID during an unrelated apiBaseUrl change in Session 10; it had to be restored by re-running eas build:configure. For config files specifically, prefer showing the specific additions/changes rather than full replacement files, or diff against the current content before handing a replacement over.

- **EAS CLI and Expo CLI auth are separate.** Logging in with npx expo login does not log in eas-cli. Run eas login explicitly even if npx expo whoami shows you already logged in.

- **eas.json is the authoritative record of build profiles.** If it's not in git, it's not reproducible. Don't rely on it being created on-demand — commit it alongside the rest of the config.

-**EAS project IDs are permanent.** Once expo.extra.eas.projectId is written into app.json and a build is made against it, changing the ID detaches from all prior build history on Expo's dashboard. Treat the ID as immutable — if you need a fresh project for any reason, that's a deliberate decision, not an accident.

## Approach & patterns

- For application code (.tsx, .ts, .java, etc.), Sean strongly prefers receiving complete replacement files to download rather than inline code edits or diff patches. For configuration files specifically (app.json, eas.json, package.json, tsconfig.json), prefer patches or targeted additions over full replacements — these files accumulate config from multiple tools and a full replacement risks silently clobbering fields that aren't obviously related to the current task.

- Git checkouts of specific commits have been used to recover stable states when builds break. See "Recovery recipes" below for the canonical single-file restore.

## Tools & resources

- **Hardware:** Windows 11 Pro desktop (dual monitors), iMin D4-503 (primary test terminal), iMin D2-402 (available), Honeywell Orbit barcode scanner
- **Dev environment:** Dev environment: WSL2 / Ubuntu 24.04, VS Code, Node.js v24 via NVM (currently v20.20.2 on the active default — needs an nvm install 24 && nvm alias default 24 to bring in line with the repo's >=22 requirement; parked as a low-priority fix), Docker Desktop (PostgreSQL 16, Redis 7), Android Studio (virtual tablet emulator), AnyDesk (remote into iMin), EAS CLI (v18.7.0+) for cloud builds
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
  - `apps/pos/eas.json`
- **Test venue:** The Harbour Inn, Douglas, IoM — with staff (Sean / Manager, Amy, Tom, Sarah), full menu with categories and items, active trading sessions and orders
- **Competitive intelligence:** Tapldoo (MWBS / Ripple on the Island) assessed and found to be payments-first with thin hospitality features — not a deep competitor on feature depth

Expo project identity:

Account: icr on expo.dev
Project slug: pos
Project ID: cbcb31d8-bb64-486b-ac34-521a71025f4a (stored in apps/pos/app.json under expo.extra.eas.projectId)
Project URL: https://expo.dev/accounts/icr/projects/pos


Host machine usernames — small but painful if forgotten:

Windows user: Sean (Downloads folder path from WSL is /mnt/c/Users/Sean/Downloads/)
Linux / WSL user: icr
These are intentionally different; don't assume they match.

- **EAS Build workflow:** Day-to-day, you still run Metro locally via npx expo start in apps/pos/. The dev client APK on the iMin connects to it the same way Expo Go used to. The difference: the dev client includes any native modules we've installed (like the iMin printer SDK in Session 12 onwards); Expo Go can't load the app at all once those are present.
When to rebuild the dev client APK:
Rebuild is needed when:

A new native dependency is added (expo-dev-client itself, react-native-printer-imin, anything with an android/ or ios/ directory)
Expo SDK is upgraded
app.json native-config fields change (app name, bundle identifier, permissions, icons, splash)
A config plugin is added or its config changes

Rebuild is not needed for ordinary code changes — adding a screen, changing a reducer, tweaking styles, modifying API calls. Metro serves those live the same as always.
Build command (from apps/pos/):
basheas build --platform android --profile development
Expect a 10-15 minute cloud queue plus 10-15 minute actual build time. Free-tier concurrency limits mean wait times can vary. Expo sends an email when the build completes. Watch the Expo dashboard at the project URL for live status.
Install the APK onto the iMin:
Once the build completes, a download URL is shown in terminal and emailed. Download the .apk file to the Windows Downloads folder. Install on the iMin via USB + ADB:
bash# Check iMin is connected and authorised
adb devices

# Install (replace filename with actual)
adb install /mnt/c/Users/Sean/Downloads/pos-<hash>.apk

# If replacing a previous dev client:
adb install -r /mnt/c/Users/Sean/Downloads/pos-<hash>.apk
Launch and connect:
On the iMin, open the newly-installed "pos" app (not Expo Go). It should show a screen prompting for the dev server URL. Enter http://192.168.199.216:8081 (same URL Expo Go uses). The bundle downloads and runs.


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
