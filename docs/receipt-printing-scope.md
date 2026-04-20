# Receipt Printing — Scope Document

_Drafted end of Session 10. Review and sign off before Session 11 begins._

## Goal

Enable the Helm till running on the iMin D4-503 to print customer receipts from the built-in 80mm thermal printer when a payment completes. This unlocks the Essentials tier as a genuinely deployable product for The Harbour Inn.

## What we're building (MVP)

A receipt print flow that:

1. Fires on payment completion in `PaymentScreen.tsx` (Cash, Card, Split, Partial all routes)
2. Produces a physical customer receipt from the iMin's 80mm internal printer
3. Renders: venue name, address, VAT number, order number, table, timestamp, staff name, itemised lines (qty, name, line total), modifiers/notes if any, subtotal, VAT breakdown by rate, total, payment method(s), change given (for cash), thank-you footer
4. Handles the £ symbol and common accented characters correctly
5. Surfaces printer errors (no paper, head open, overheat) to staff as actionable UI messages rather than silent failures
6. Offers a reprint-last-receipt affordance somewhere sensible (post-MVP acceptable)

## What we are NOT building yet

Flagged explicitly so they don't creep into the MVP:

- Kitchen receipts (different layout, triggered on send-to-kitchen)
- Reprint arbitrary historical receipts from order history
- Logo/bitmap printing at the top of receipts
- Cash drawer kick signal
- X-read / Z-read printed reports (currently on-screen only)
- Barcode or QR code on receipts (feedback URL, order tracking, etc.)

## Hardware facts established

- **Device:** iMin D4-503, model I20D01, Android 11
- **Printer:** 80mm thermal, internal, connected via USB (per iMin SDK docs, D4 series uses `PrintConnectType.USB`)
- **Character width at default text size:** 48 characters per line at 80mm
- **Effective pixel width:** 576 px (matches the SDK's `setTextWidth(576)` default)

## Integration approach

**Recommendation: use the official `react-native-printer-imin` npm package published by iMin Software themselves (`iminsoftware` on GitHub and npm).**

### Why this package and not another

Four candidate packages exist on npm:
- `react-native-printer-imin` — **published by iMin themselves**, actively maintained, latest release ~weeks ago, bundles the current `iminPrinterSDK-15_V1.3.2_2505261539.jar`
- `@ponchodien/react-native-printer-imin` — a fork, ~a year old, appears abandoned
- `react-native-imin-inner-printer` — community, 4 years old, clearly stale
- `react-native-imin-sdk` — very old, v1.0.1, abandoned

The iMin-published one is the obvious choice: it's the vendor's own wrapper, it stays in sync with SDK updates (including recent fixes like Android 16k page support and A15 adaptation), and it exposes the same method surface documented in iMin's own printer docs. Using it means we're not maintaining our own Java bridge code — iMin do that for us.

### What the package gives us

Direct mapping to the SDK methods already documented in iMin's printer guide:

- `initPrinter()`, `getPrinterStatus()`
- `setAlignment()`, `setTextSize()`, `setTextStyle()`
- `printText()`, `printColumnsText()` (the critical one for receipt layout)
- `printAndLineFeed()`, `printAndFeedPaper(n)`, `partialCut()`
- Transaction mode: `enterPrinterBuffer()`, `commitPrinterBuffer(callback)`, `exitPrinterBuffer(commit, callback)` — lets us submit a whole receipt atomically and get success/failure codes back
- `printQrCode()`, `printBarCode()` — available for future use
- `printSingleBitmap()` — for logo printing in a later phase

## The Expo compatibility problem — and the fix

### The blocker

Native Android modules like the iMin SDK **do not run in Expo Go**. Expo Go is a fixed container with a predetermined set of native modules baked in; third-party native libraries are not one of them. As soon as we `npm install react-native-printer-imin`, Expo Go stops being a viable test path for this feature.

This matters a lot given the crib sheet note:

> **Expo Go is the stable test path.** Local dev build APKs have caused repeated cascading failures and should not be attempted again without careful pre-assessment of SDK, Kotlin, Gradle, and monorepo compatibility.

We were burnt by local dev builds before. We cannot ignore this.

### The modern fix: EAS Build with a development build client

The right answer in 2026 is not "local dev builds" (which is what bit us last time), it's **EAS Build producing a development client APK**. The key differences:

- **EAS Build runs in Expo's cloud**, not on your Windows PC. This means we avoid the Kotlin/Gradle/SDK/monorepo-hoisting conflicts that sank us before — those are all problems caused by the Windows/WSL local build toolchain, not by dev builds as a concept.
- **Continuous Native Generation (CNG)** handles the `android/` directory autogeneration. We don't hand-edit native files; we let Expo prebuild regenerate them from `app.json` + config plugins every time.
- The **development client APK** installs on the iMin once and stays there. It behaves almost identically to Expo Go from a developer experience standpoint (Metro bundler, fast refresh, shake-to-reload) — the only difference is that it includes our native modules.

This is a meaningfully different approach from what failed before, and it's the Expo-sanctioned way of using native libraries.

### Risk: the package may or may not have a config plugin

Ideally `react-native-printer-imin` ships with an Expo config plugin so we can `expo prebuild` and have the native bits wired up automatically. The README doesn't explicitly mention one, but the project is new enough that it may. **Verifying this is the first task of Session 11.** If there's no config plugin, we have two options:

1. Write a tiny config plugin ourselves that adds the required `android/` configuration (usually a few lines of Gradle)
2. Run `expo prebuild` once to generate the `android/` directory and hand-edit it, checking the result into the repo (this is the "bare workflow" escape hatch)

Both are recoverable; option 1 is cleaner long-term.

### Risk: losing Expo Go for the POS app entirely

Once we add the iMin native module, the POS app can no longer be tested in Expo Go **on any device**. This includes the Android emulator we use for secondary testing. Everything goes through EAS-built development clients from that point on.

**Mitigation:** the emulator has no printer anyway, so we can wrap all printer calls in a runtime check (`if (Platform.OS === 'android' && printerAvailable)`) and stub them out elsewhere. This way the app still runs on the emulator for non-printing work.

## Proposed session breakdown

### Session 11 — EAS Build foundation (no printing yet)

This session is deliberately scoped to "prove EAS Build works for us, and we can still run the existing app on the iMin via a dev client." No printer work. If this session doesn't land cleanly, we pause and reassess before investing further.

Tasks:

1. Sign Sean up for an Expo account if not already (free tier is sufficient for development builds)
2. Install `eas-cli` globally
3. `eas build:configure` in `apps/pos`
4. Create a `development` build profile in `eas.json` targeting Android
5. Install `expo-dev-client` in the POS app
6. Run a first EAS build — this produces an APK that can be installed on the iMin
7. Install the APK on the iMin via AnyDesk
8. Verify the app still works end-to-end (PIN login, walk-in order, payment) via the dev client instead of Expo Go
9. Document the new dev workflow in the crib sheet

Exit criteria: till works on iMin via dev client APK. Existing Expo Go workflow still available for the emulator as a safety net. No printer work.

### Session 12 — Printer integration and test print

1. `npx expo install react-native-printer-imin`
2. Check for a config plugin; if present, register in `app.json`; if absent, write a minimal one
3. Re-run `eas build` with the new native dep included
4. Install updated APK on iMin
5. Write a bare-bones `PrinterService` module in `apps/pos/src/services/` that wraps the SDK's core methods and provides a typed, promise-based API
6. Build a "Test Print" button, hidden behind manager PIN, in the Reports area, that prints a simple "Hello Harbour Inn" receipt with £ symbol, special characters, alignment samples
7. Verify on iMin

Exit criteria: manager can tap Test Print and a receipt comes out that proves the SDK works, the £ renders correctly, and column layout is understood.

### Session 13 — Real receipt generation and layout

1. Design the receipt layout: venue header, order block, items, totals, payment, footer
2. Build a `ReceiptBuilder` that takes an Order object (already available from the API) and produces the sequence of SDK calls
3. Handle VAT breakdown (multiple rates)
4. Handle cash-change display for cash payments
5. Handle split and partial payment receipts (these are subtly different — a partial receipt shows what's been paid *so far* and what remains)
6. Wire into `PaymentScreen.tsx`'s success callback
7. Surface printer error codes as user-friendly UI messages
8. End-to-end test with real-ish orders

Exit criteria: every payment type (Cash, Card, Split by covers, Partial by item, Partial by amount) produces a sensible receipt from the iMin's printer, errors surface usefully.

### Session 14 — Polish and stretch goals

- Reprint last receipt (small UI affordance on the table plan or via manager menu)
- Logo printing (if venue has one) via `printSingleBitmap`
- Footer customisation (VAT number, marketing message) configurable per venue
- Test on the secondary iMin D2-402 to confirm portability

## Estimated total effort

**Three to four sessions** from start to deployed Essentials-tier printing. Session 11 is the foundation-risk session — if it goes sideways, we need to reassess; if it goes smoothly, the rest is largely mechanical application.

## Outstanding unknowns — to be resolved early in Session 11

1. Does `react-native-printer-imin` ship with an Expo config plugin? (Check `package.json`'s `expo.plugin` field or the package's `app.plugin.js`)
2. Does Sean already have an Expo account? (If not, 2 minutes to set up)
3. Does the monorepo structure play nicely with EAS Build? (Expo supports monorepos via `eas.json`'s `build.*.requireCommit` and explicit working-directory config, but this is worth verifying on a first build rather than assuming)
4. Does the iMin D4-503 have USB debugging enabled so we can sideload APKs via AnyDesk / ADB? (If not, 1 minute to enable in developer options)

None of these are blockers; all are verifications.

## Risks and mitigations

**Risk 1: EAS Build free tier limits.** Free accounts get 30 Android builds per month. Three or four sessions with a few builds each shouldn't come close to this, but worth being aware of. Mitigation: space builds deliberately; don't rebuild for every tiny code change.

**Risk 2: Losing fast iteration speed.** An EAS build takes ~10-15 minutes vs Expo Go's instant reload. Mitigation: keep the Expo Go workflow available for non-native-module work (POS logic, UI tweaks) by maintaining a branch/config where the printer is conditionally stubbed. Use dev-client APKs only for printer work.

**Risk 3: The iMin SDK interacts badly with Android 11 on the D4-503 specifically.** Unlikely given iMin's own package supports the D4 series, but if something doesn't work we have a direct vendor relationship (the iMin GitHub issues tracker) to escalate to.

**Risk 4: Character encoding for £.** The SDK uses high-level Java String rendering, which means Unicode should work natively. The Chinese comments in iMin's own docs suggest CJK and general Unicode support is mature. Mitigation: first test print in Session 12 includes £ specifically as a verification.

## Decision needed from Sean before Session 11 begins

1. **Is the proposed approach (EAS Build + `react-native-printer-imin`) the right call, or do you want a different path discussed?**
2. **Are you happy with the three-to-four session estimate and the session breakdown?**
3. **Do you have an Expo account already, or need to create one?**

Sign-off noted here before Session 11 work begins:

> _(to be filled in)_
