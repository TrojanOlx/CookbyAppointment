# Design QA

## Comparison Target

- Source visual truth:
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-546c2a45-dc5a-44a0-b8a6-c9cb82508384.png` (658 x 1414 px, menu list)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-2e2bd5cc-9544-4a78-86f3-a42d9d808679.png` (692 x 1366 px, dish detail)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-5a4a5c11-0159-4c81-a696-9dddbe5dcb1f.png` (770 x 1396 px, profile)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-bfc6e5f2-a110-4825-bb09-fe0a540b2002.png` (674 x 1374 px, booking reference)
- Implementation screenshot: unavailable.
- Intended CSS viewports: 320 px, 375 px, and 430 px wide; device scale and density could not be measured without a rendered capture.
- State: authenticated family member viewing family, booking, recommendation, preference, and shopping flows.

## Full-View Comparison Evidence

The source screenshots were opened and inspected. They establish the visual system used by the implementation: mint dotted background, warm cream surfaces, teal highlights, brown text, compact rounded controls, and a safe-area-aware bottom action dock. No valid implementation screenshot could be captured, so a same-viewport comparison was not possible.

## Focused Region Evidence

Focused comparison is blocked for the same reason. The intended regions were page headers, content-card spacing, empty/error states, icon alignment, and the booking/create/preference bottom docks.

## Findings

- P1: Runtime visual evidence is missing. The WeChat Developer Tools CLI reports that the IDE service port is disabled. Confirming the CLI prompt did not persist the setting, and the IDE port file did not become available before timeout.
- P2: Responsive overflow, keyboard/modal placement, and safe-area behavior cannot be confirmed from source code alone at 320 px, 375 px, and 430 px widths.
- P2: Fonts, actual rendered line wrapping, icon baselines, image sharpness, and final color appearance cannot be compared without implementation captures.
- Static review completed for booking, shopping, recommendation, preferences, family create/list/invite/members, and profile family entry. These pages now share the mint patterned background, warm cream surfaces, teal primary actions, brown text, inline loading/error/empty states, and safe-area-aware action docks.
- Static review fixed the missing family icon reference, the recommendation return-from-family flow, family-list false empty state, stale family responses, preference refresh/save state, and the global bottom-bar selector overriding the preference dock.

## Comparison History

- Pass 1: Source screenshots inspected; implementation capture blocked before comparison. No visual fixes were claimed from screenshot evidence.
- Pass 2: Source-level layout and state audit completed after the fixes. A second CLI attempt accepted the service-port prompt but timed out waiting for the IDE `.ide` port file, so no implementation screenshot was produced.

## Automated Evidence

- `npm run check`: passed (22 unit tests and 7 migration assertions).
- `npm run test:integration`: passed (48 Worker+D1 assertions).
- JavaScript syntax, JSON parsing, WXML tag balance, WXSS brace balance, local image reference validation, and `git diff --check`: passed.

## Blocker

Open WeChat Developer Tools, then enable `Tools -> Settings -> Security Settings -> Service Port`. After the IDE exposes its port, capture the same states at 320 px, 375 px, and 430 px and repeat the comparison.

final result: blocked
