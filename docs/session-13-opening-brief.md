# Session 13 opening brief

*Appendix to docs/helm-crib-sheet.md — for the start of Session 13*

## Where we ended Session 12

Physical receipts print end-to-end from the iMin D4-503 in the dev client. Test receipts render with correct content: centred venue header, item lines with quantity/name/price, horizontal rules, subtotal/VAT/total block, cash + change, partial cut. £ symbols render correctly. Line spacing tightened to 0.65 for ~25% paper saving. VOID items clearly marked. VAT labelled as "VAT 20% (incl.)" for unambiguous inclusive-pricing display.

Committed as `d22ea41` (foundation) → `aa3d736` (iterations 1 and 2) → final iteration 4 commit at end of session.

## The unresolved polish issue

Prices do not right-align to a consistent column. Body-sized prices line up via left-anchored £ symbols (all £s start at character 40). TOTAL's £ drifts right because of font-size scaling. Iteration 3 attempted right-alignment via `padLeft` into a fixed column; the logic was correct but the printed output still did not column-align because trailing-space padding is not the right SDK primitive.

## Session 13 plan — single task

**Right-align every price on the receipt using `printColumnsText`.**

This is a dedicated iMin SDK primitive that takes columns, widths, and alignment flags. It is the correct tool for our case and we have not yet used it. Character-padding in pre-built strings is not producing column alignment on this hardware and we should stop trying.

Approach:

1. Grep `~/epos-platform/node_modules/react-native-printer-imin/src/typing.ts` for `printColumnsText` to read the exact signature
2. Replace every `printLeft(..., priceLine(label, money, ...), ...)` call in `IminPrinterService.emitReceipt` with a `printColumnsText` call taking two columns: label (left-aligned), price (right-aligned)
3. Handle the TOTAL line — same pattern but with SIZE_TOTAL. If printColumnsText doesn't respect text size, we may need to print TOTAL with a non-columnised call and accept that one line doesn't right-align perfectly
4. Verify with a single print. Success criterion: rightmost digit of every money value ends at the same column. The pen-line test works — if a manager could draw a vertical line down the right side of the receipt and every price's last digit touches that line, we're done

## What not to do

- Don't iterate on `padRight` / `padLeft` values. That approach hit its ceiling in Session 12
- Don't try to calculate font-size ratios to compensate for character width scaling. Too fragile, breaks on font changes
- Don't combine this with any other change. Session 13's first task is this one polish issue; integration with PaymentScreen is a separate task afterwards

## Other carried-over items (unchanged from Session 12 close)

- Fresh-install /api/sessions/null/current race condition (Session 11 bug, not yet fixed)
- Logout button on wrong screen and non-functional
- TestPrintScreen needs a more visible Back button on small screens
- WSL clock drift occasionally
- Shared domain types file (`apps/pos/src/types/domain.ts`) to replace inline Order/OrderItem across screens — deferred technical debt
- Wire real receipt printing into PaymentScreen.tsx (Session 13 after the layout fix)
- Sunmi adapter once iMin fully proven

## Known-good state to return to

Iteration 4 as committed. Run `npx expo start --clear` from `apps/pos/`, open app on iMin, Tables → Manager → PIN → Reports → Printer Test. Tap Print Test Receipt. Receipt should print cleanly.
