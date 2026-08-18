# Design QA

## Comparison Target

- Source visual truth:
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-ee77d101-1688-4a2a-a5db-cb7c568eb88c.png` (fridge recommendation hierarchy and card rhythm before the current pass)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-674a0aa0-4b4a-45e1-b3e8-5ef5a7b246de.png` (inventory bottom whitespace around the floating add control)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-7b5011a7-b924-4572-9cb8-5dc1c17a37d9.png` (shopping header-to-summary spacing and duplicated add controls)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-3d44f1db-33d4-44fa-877d-21eca9a6fd40.png` (owner exit state on family members)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-cad71fb8-381b-4939-a416-5e39f3bb917b.png` (family invitation composition)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-d6125c21-e49c-48a1-a770-3962802ad7a7.png` (shopping header vertical density)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-570cbab7-5854-4e97-9326-65c8e9cc13ff.png` (inventory, bottom whitespace and FAB)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-ac6e5e88-17b2-4862-9b47-7698d29cf094.png` (shopping header contrast)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-d66375eb-b801-4394-91dc-2e2b2541492a.png` (shopping modal close control)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-24154681-b4f0-42ad-807e-46141da517ea.png` (booking dish selection)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-546c2a45-dc5a-44a0-b8a6-c9cb82508384.png` (658 x 1414 px, menu list)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-2e2bd5cc-9544-4a78-86f3-a42d9d808679.png` (692 x 1366 px, dish detail)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-5a4a5c11-0159-4c81-a696-9dddbe5dcb1f.png` (770 x 1396 px, profile)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-bfc6e5f2-a110-4825-bb09-fe0a540b2002.png` (674 x 1374 px, booking reference)
- Implementation screenshot: unavailable.
- Intended CSS viewports: 320 px, 375 px, and 430 px wide; device scale and density could not be measured without a rendered capture.
- State: authenticated family member viewing family, booking, recommendation, preference, and shopping flows.

## Full-View Comparison Evidence

The source screenshots were opened and inspected. They establish the visual system used by the implementation: mint dotted background, warm cream surfaces, teal highlights, brown text, compact rounded controls, and safe-area-aware floating or docked actions. The current pass targets owner-only family dissolution, the invitation page composition, and shopping header vertical density. No valid implementation screenshot could be captured, so a same-viewport comparison was not possible.

## Focused Region Evidence

Focused comparison is blocked for the same reason. The intended regions were the family danger action, invitation role selector and fixed dock, and the shopping title/tag/subtitle alignment.

## Findings

- P1: Runtime visual evidence is missing. The WeChat Developer Tools CLI still reports that the IDE service port is disabled, including after launching the installed IDE and retrying its detected port.
- P2: Responsive overflow, keyboard/modal placement, and safe-area behavior cannot be confirmed from source code alone at 320 px, 375 px, and 430 px widths.
- P2: Fonts, actual rendered line wrapping, icon baselines, image sharpness, and final color appearance cannot be compared without implementation captures.
- Static review completed for inventory, shopping, and booking. Inventory now uses a bounded flex scroll region, compact two-level item metadata, real WeUI icons, and a safe-area-aware FAB. Shopping places its heading, family context, and actions on a high-contrast cream surface and constrains the modal close control to a circle. Booking adds a horizontally scrollable type filter combined with keyword search without clearing hidden selections.
- Static review completed for the current family pass. Owners now see a distinct destructive dissolve action with two confirmations; the invitation primary action is in a safe-area dock; and the shopping header uses a compact two-column title/meta layout with the subtitle below the right-side tag.
- Static review completed for the recommendation and floating-action pass. Fridge recommendations now use a compact cream header, an integrated diner selector, menu-style padded dish cards, real WeUI icons, and an independently scrolling safe-area-aware result list. Inventory and shopping no longer reserve a full FAB-height blank strip at the bottom. Shopping exposes one menu-style floating add control and adds explicit separation between its header and weekly summary.

## Comparison History

- Pass 1: Source screenshots inspected; implementation capture blocked before comparison. No visual fixes were claimed from screenshot evidence.
- Pass 2: Source-level layout and state audit completed after the fixes. A second CLI attempt accepted the service-port prompt but timed out waiting for the IDE `.ide` port file, so no implementation screenshot was produced.
- Pass 3: The four current issue screenshots were inspected and the three target pages were reviewed at source level. The installed IDE was launched and CLI retried on the detected port, but service-port access remained disabled.
- Pass 4: The owner, invitation, and shopping screenshots were inspected. Source-level responsive constraints and destructive states were reviewed; CLI capture remained blocked because the IDE service port is disabled.
- Pass 5: The recommendation, inventory-bottom, and shopping-spacing screenshots were inspected. Source-level responsive constraints were reviewed at the 320 px breakpoint; the Developer Tools CLI was retried while the IDE was open and again reported that the service port is disabled.

## Automated Evidence

- `npm run check`: passed (22 unit tests and 7 migration assertions).
- `npm run test:integration`: passed (48 Worker+D1 assertions).
- JavaScript syntax, JSON parsing, WXML tag balance, WXSS brace balance, local image reference validation, and `git diff --check`: passed.
- Family cache cleanup and the owner dissolve confirmation flow were exercised with isolated behavior checks: passed.

## Blocker

Open WeChat Developer Tools, then enable `Tools -> Settings -> Security Settings -> Service Port`. After the IDE exposes its port, capture the same states at 320 px, 375 px, and 430 px and repeat the comparison.

final result: blocked
