# Design QA

## Current Pass: Profile Achievement Entry, Option 2 (2026-08-28)

### Comparison Target

- Selected visual target: `/Users/trojan/.codex/generated_images/01a04796-8cb7-7901-b7d0-c1225c63b181/exec-cdb626c0-9d50-44ea-861f-adae34ef07a7.png` (853 x 1844 px).
- Final implementation: `.tmp-visual-qa/profile-header-achievement-option-2.png` (624 x 1352 px).
- Additional states: `.tmp-visual-qa/profile-header-achievement-option-2-long-name.png` and `.tmp-visual-qa/profile-header-achievement-option-2-editing.png`.
- Combined comparison: `.tmp-visual-qa/profile-header-achievement-option-2-comparison.png`, with the selected target on the left and implementation on the right.
- Viewport: iPhone 12/13 Pro simulator, 390 x 844 logical px, device pixel ratio 3; content window 390 x 753 logical px.

### Full-View Comparison Evidence

The identity card now follows the selected single-row composition: avatar, pinned/default badge and nickname, a vertical divider, then an icon-only progress action. The live page keeps its existing compact vertical rhythm while preserving the target's cream surface, teal ring, brown typography, and restrained shadow. The former multicolor rail and dotted card fill have been removed.

### Focused Region Evidence

The achievement action measures 95 x 45 CSS px and the nickname surface measures 143 x 43 CSS px. The action therefore preserves the 88rpx minimum touch height, while long nicknames truncate without moving the divider or progress count. The edit input stays inside the same card height and does not overlap the badge, divider, or action.

### Findings

- Pass: Visible achievement copy is reduced to the award icon, `unlocked/total` count, and arrow. The word `成就` is absent from the rendered interface; the richer phrase remains only in the accessibility label.
- Pass: Avatar, badge, nickname, divider, progress, and arrow share one stable vertical axis in normal, long-name, and edit states.
- Pass: The card uses the existing Animal Island cream, teal, brown, and soft tan tokens without introducing a competing palette or decorative treatment.
- Pass: The nickname retains one-line ellipsis behavior, and the right action retains a fixed width for `0/12` through `12/12` style values.
- Pass: Existing choose-avatar, edit-nickname, pinned-badge, and achievement-navigation bindings are unchanged.
- Pass: No actionable P0, P1, or P2 issue remains.

### Comparison History

- Pass 1: The target was translated into a single-row WXML structure, removing the lower achievement copy row and decorative profile rail.
- Pass 2: The implementation, long-name state, and edit state were captured at the same viewport. Measured hit targets and truncation passed without a follow-up visual fix.

### Verification

- WeChat Developer Tools automation compile and screenshot capture: passed.
- WeChat Developer Tools preview compile: passed; total package size 1.3 MB.
- Simulator console and exception filters for `error|exception|fail`: empty.
- WXML asset references and `git diff --check`: passed.

Current pass result: passed.

## Current Pass: Avatar-to-Name Spacing (2026-08-28)

### Comparison Target

- Source visual truth: `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-c70cf6a5-f5ce-4c32-8b9b-7ba77e45aeb2.png` (710 x 262 px, default-avatar profile header before this spacing pass).
- Final implementation: `.tmp-visual-qa/profile-header-spacing-real.png` (624 x 1352 px).
- Additional states: `.tmp-visual-qa/profile-header-spacing-default-avatar.png`, `.tmp-visual-qa/profile-header-spacing-long-name.png`, and `.tmp-visual-qa/profile-header-spacing-editing.png`.
- Viewport: iPhone 12/13 Pro simulator, 390 x 844 logical px, device pixel ratio 3; content window 390 x 753 logical px.
- Density normalization: the source viewport was cropped to 624 x 262 px at x=34; the implementation was cropped to 624 x 262 px at y=119. The equal-pixel crops are combined in `.tmp-visual-qa/profile-header-spacing-comparison.png`.
- State: authenticated profile with real avatar, matching default-avatar reference, long nickname, and nickname input.

### Full-View Comparison Evidence

The four implementation screenshots preserve the 366 x 96 CSS px profile card, existing navigation and menu positions, and safe-area layout. `.tmp-visual-qa/profile-header-spacing-states.png` places the normal, long-name, and edit states together; no card growth, vertical movement, overlap, or clipping is visible.

### Focused Region Evidence

`.tmp-visual-qa/profile-header-spacing-comparison.png` places the normalized source on the left and implementation on the right. The avatar image measures 58 x 58 CSS px at x=48 and the nickname starts at x=118, producing a 12px image-to-text gap. Before this pass the nickname started at x=110, leaving approximately 4px; the added 16rpx content padding contributes the requested 8px increase.

### Findings

- Pass: Typography is unchanged at 36rpx/900 with zero letter spacing. The 244 x 43 CSS px nickname region remains a one-line ellipsis surface for long names.
- Pass: Spacing is intentionally widened only between the avatar and name. Avatar, 366 x 96 CSS px card, rail, vertical centering, radii, and shadows are unchanged.
- Pass: Colors and visual tokens are unchanged; no new palette, gradient, opacity, or contrast treatment was introduced.
- Pass: Uploaded avatars retain `aspectFill`; the existing profile icon retains `aspectFit` in the default state, with no crop, blur, or masking regression.
- Pass: Copy and content are unchanged. The profile-completion hint remains visible only for the incomplete-profile state.
- Pass: The nickname input remains 244 x 43 CSS px and fits without clipping. No actionable P0, P1, or P2 issue remains.

### Comparison History

- Pass 1: The source and current default-avatar header were normalized into one focused comparison. The requested extra spacing is visible, but no unrelated visual drift was found.
- Pass 2: Real-avatar, long-name, default-avatar, and edit states were captured at the same viewport. Long text truncates, the input remains usable, and the post-fix comparison passes without further changes.

### Verification

- WeChat Developer Tools `compile_wxss`: passed.
- Current page and device state: `pages/profile/profile`, iPhone 12/13 Pro, 390 x 844 logical px.
- Simulator console and network filters for `error|exception|fail`: empty.
- Authenticated state was restored through `fetchUserInfo`; no profile mutation was submitted.
- `git diff --check`: passed.

Current pass result: passed.

## Previous Pass: Profile Header Layout (2026-08-28)

### Comparison Target

- Source visual truth: `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-efa250b0-de0f-4b66-a0e9-cf67f260735c.png` (652 x 1368 px, authenticated profile before the layout pass).
- Final implementation: `.tmp-visual-qa/profile-header-optimized.png` (624 x 1352 px).
- Additional final states: `.tmp-visual-qa/profile-header-long-name.png`, `.tmp-visual-qa/profile-header-editing.png`, and `.tmp-visual-qa/profile-header-default-avatar.png`.
- Viewport: iPhone 12/13 Pro simulator, 390 x 844 logical px, device pixel ratio 3; content window 390 x 753 logical px.
- Density normalization: the source's 10 px simulator margins were cropped to 632 x 1368, then scaled to 624 x 1352. The implementation capture remained at its native 624 x 1352 output.
- State: authenticated user on `pages/profile/profile`; normal avatar/name, long name, nickname input, and missing-avatar fallback were checked.

### Full-View Comparison Evidence

`.tmp-visual-qa/profile-header-comparison.png` places the normalized source on the left and final implementation on the right. The implementation intentionally reduces the profile card from the source's oversized header to a measured 366 x 96 CSS px surface. The first menu group moves upward without colliding with the header, persistent tab bar, or safe area.

### Focused Region Evidence

`.tmp-visual-qa/profile-header-comparison-focus.png` compares the profile region at the same crop. The source's large gap between avatar and nickname is removed: the avatar button begins at x=44 CSS px and the nickname begins at x=110 CSS px. Avatar, accent rail, nickname, and edit input share one stable horizontal axis.

### Findings

- Pass: Fonts and typography preserve the existing brown display hierarchy. The nickname uses 36rpx/900, the edit field uses 34rpx/800, letter spacing remains zero, and long names truncate on one line without resizing the card.
- Pass: Spacing and layout use a fixed 128rpx avatar button, 112rpx image, compact 28rpx vertical padding, and a 10 x 96rpx accent rail. The native button auto margins are explicitly reset, eliminating the reported dead space.
- Pass: Colors and visual tokens remain within the existing mint, cream, teal, yellow, coral, and brown system. No new palette or decorative treatment was introduced.
- Pass: Image quality uses `aspectFill` for uploaded avatars and the existing `icon-profile.svg` asset with `aspectFit` for the empty state. The fallback is legible and no image placeholder remains.
- Pass: Copy is unchanged. Existing profile-completion guidance and all menu labels remain intact.
- Pass: The nickname display and edit field both measure 252 x 43 CSS px, providing a stable near-44px touch/input target while the overall card remains 366 x 96 CSS px.
- Pass: No actionable P0, P1, or P2 issue remains in the normal, long-name, edit, or missing-avatar states.

### Comparison History

- Pass 1: The source showed an oversized card and a large avatar-to-name gap caused by the native button's automatic margins.
- Pass 2: The compact layout rendered correctly in normal, long-name, and edit states, but the first missing-avatar asset rendered as a blank circle. The fallback was switched to the project's verified profile icon.
- Pass 3: The focused comparison found a 33px nickname hit target. Display and input heights were raised to 84rpx; both now measure 43 CSS px without increasing card height.
- Pass 4: WXML/WXSS were recompiled, all four states were recaptured, the authenticated state was restored, and the final comparison found no remaining P0/P1/P2 issue.

### Verification

- WeChat Developer Tools `compile_wxml` and `compile_wxss`: passed.
- Current page and device state: `pages/profile/profile`, iPhone 12/13 Pro, 390 x 844 logical px.
- Simulator console filter for `error|exception|fail`: empty.
- Primary visual states tested: normal profile, long nickname truncation, focused nickname input, and default avatar.
- Avatar selection and nickname-save mutations were not invoked; their existing event bindings and TypeScript methods were left unchanged.

Current pass result: passed.

## Comparison Target

- Source visual truth:
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-f4e65deb-c130-4f71-81bc-5610f58102e6.png` (family selector before the hierarchy and action-width alignment pass)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-a55d23ed-0365-46af-9446-52fea73c9703.png` (shopping source tag separated from the ingredient name and modal close alignment)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-15f842ec-436a-4d87-9b3f-3370490c9fc9.png` (shopping item hierarchy, alignment, and action density before the item-layout pass)
  - `/var/folders/q5/0_x8l22d3cd1sy17l2gnzzkh0000gp/T/codex-clipboard-6be9ce2d-1100-4e9d-8bed-5e24edcb7caa.png` (shopping list tail clipped by the floating add control and bottom safe area)
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
- Implementation screenshots:
  - `.tmp-visual-qa/14-family-index-unified.png`
  - `.tmp-visual-qa/15-family-index-comparison.png`
  - `.tmp-visual-qa/11-shopping-tag-inline.png`
  - `.tmp-visual-qa/12-shopping-modal-close.png`
  - `.tmp-visual-qa/01-fridge-recommend.png`
  - `.tmp-visual-qa/02-inventory.png`
  - `.tmp-visual-qa/03-shopping.png`
  - `.tmp-visual-qa/04-shopping-add-modal.png`
  - `.tmp-visual-qa/06-shopping-bottom-before-scroll.png`
  - `.tmp-visual-qa/07-shopping-bottom-after-scroll.png`
  - `.tmp-visual-qa/09-inventory-bottom-after-scroll.png`
  - `.tmp-visual-qa/10-shopping-item-redesign.png`
- Captured viewport: iPhone 12/13 Pro simulator, 390 x 844 logical px, 3x pixel ratio; screenshot output 624 x 1352 px.
- Additional intended CSS viewports: 320 px, 375 px, and 430 px wide.
- State: authenticated family member viewing family, booking, recommendation, preference, and shopping flows.

## Full-View Comparison Evidence

The source screenshots and current implementation captures were opened and inspected side by side. The implementation preserves the established mint dotted background, warm cream surfaces, teal highlights, brown text, compact rounded controls, and safe-area-aware floating actions. At the captured 390 px viewport, fridge recommendation now has a compact header and menu-style result rhythm; inventory content continues behind a true floating add control; and shopping has balanced header-to-summary spacing with one floating add entry. No horizontal overflow, clipped content, or incoherent overlap was observed.

## Focused Region Evidence

Focused comparisons were completed for the fridge recommendation header/cards, inventory bottom edge and floating add control, shopping header/summary/action placement, and shopping add modal. The modal close control, labels, fields, and submit action remain readable and fully visible above the safe area in the captured state.

## Findings

- Pass: Fridge recommendation renders 37 results with consistent card padding, readable availability/expiry explanations, and no clipping or image failures.
- Pass: Inventory list reaches the bottom viewport edge while its menu-style add control remains independently floating above the safe area.
- Pass: Shopping keeps clear separation between the page header and weekly summary, exposes only one floating add control, and presents a readable empty state.
- Pass: Shopping add modal has a legible circular close control, high-contrast fields, and a fully visible submit action at the captured 390 px viewport.
- Pass: Shopping with four active items keeps the final assignee/delete row and synchronization footnote visible; after scrolling to the end, the list clears the floating add control and bottom safe area.
- Pass: Inventory scrolls its final card fully above the floating add control with a stable safe-area gap.
- Pass: Shopping items now align the completion control independently, present name and quantity as the primary row, group source/note as supporting metadata, and expose assignee/delete as compact, visually distinct actions.
- Pass: Shopping source tags now sit directly after ingredient names while quantity pills remain right aligned; long names keep a bounded ellipsis region and notes only occupy a row when present.
- Pass: Shopping and admin file-detail close controls use the same icon button pattern, sit at the modal upper-right, provide an 80rpx touch target, and preserve title clearance. All three custom modal surfaces now account for top and bottom safe areas.
- Pass: The page-wide static audit corrected five related narrow-screen risks: appointment header wrapping, selected-dish checkmark clearance, long admin appointment/review name truncation, and duplicate review-status padding.
- Pass: The family selector now shares the family-member page's 72rpx avatar, 30rpx title, compact card rhythm, fixed-size action control, and established color/shadow tokens. Full family names remain readable, the current marker stays beside the name, and neither action expands across the card.
- Evidence limit: The simulator did not display the software keyboard after focusing an input, so keyboard occlusion remains unverified.
- Evidence limit: This runtime pass captured the 390 px iPhone 12/13 Pro viewport only; 320 px and 430 px remain covered by static responsive review rather than screenshots.
- Static review completed for inventory, shopping, and booking. Inventory now uses a bounded flex scroll region, compact two-level item metadata, real WeUI icons, and a safe-area-aware FAB. Shopping places its heading, family context, and actions on a high-contrast cream surface and constrains the modal close control to a circle. Booking adds a horizontally scrollable type filter combined with keyword search without clearing hidden selections.
- Static review completed for the current family pass. Owners now see a distinct destructive dissolve action with two confirmations; the invitation primary action is in a safe-area dock; and the shopping header uses a compact two-column title/meta layout with the subtitle below the right-side tag.
- Static review completed for the recommendation and floating-action pass. Fridge recommendations now use a compact cream header, an integrated diner selector, menu-style padded dish cards, real WeUI icons, and an independently scrolling safe-area-aware result list. Inventory and shopping no longer reserve a full FAB-height blank strip at the bottom. Shopping exposes one menu-style floating add control and adds explicit separation between its header and weekly summary.

## Comparison History

- Pass 1: Source screenshots inspected; implementation capture blocked before comparison. No visual fixes were claimed from screenshot evidence.
- Pass 2: Source-level layout and state audit completed after the fixes. A second CLI attempt accepted the service-port prompt but timed out waiting for the IDE `.ide` port file, so no implementation screenshot was produced.
- Pass 3: The four current issue screenshots were inspected and the three target pages were reviewed at source level. The installed IDE was launched and CLI retried on the detected port, but service-port access remained disabled.
- Pass 4: The owner, invitation, and shopping screenshots were inspected. Source-level responsive constraints and destructive states were reviewed; CLI capture remained blocked because the IDE service port is disabled.
- Pass 5: The recommendation, inventory-bottom, and shopping-spacing screenshots were inspected. Source-level responsive constraints were reviewed at the 320 px breakpoint; the Developer Tools CLI was retried while the IDE was open and again reported that the service port is disabled.
- Pass 6: Service-port authorization succeeded. Fridge recommendation, inventory, shopping, and the shopping add modal were captured at a 390 x 844 logical viewport and compared side by side with their source screenshots. Visual checks passed; simulator console and network error filters returned no errors.
- Pass 7: The reported populated-shopping state was reproduced with four items at the same 390 x 844 logical viewport. Explicit scroll-tail spacers were verified on shopping and inventory; both final items clear their floating actions and the Home safe area. The other fixed-action pages were statically audited and already have dedicated spacers or dynamic bottom-height handling.
- Pass 8: The four-item shopping state was captured again after the item-layout pass and compared side by side with the reported screenshot. Quantity pills, assignee controls, and delete icon buttons remain aligned without clipping; tapping delete still opens the destructive confirmation dialog before any mutation.
- Pass 9: The reported shopping state was captured after moving source tags beside ingredient names. The populated list and add modal compile and render at 390 x 844 logical px with no overlap; the close control is visibly anchored to the upper-right and the console/network error filters are empty.
- Pass 10: The reported family-selector screenshot was normalized to the implementation height and combined with the revised 390 x 844 logical viewport capture. The earlier stretched create/member controls and truncated family name were corrected; the create and member-management routes were both exercised successfully with empty console/network error filters.
- Pass 11: The family selector received a permanent join action beside create, plus a dedicated scan/manual-code page. The invitation result keeps copy/share actions and adds a bounded Mini Program code surface with save and failure states. Static review covers 320 px through 430 px widths; the current IDE agent interface rejected single-file compile and capture because its local `agent.skills` list is empty, so no new runtime screenshot is claimed for this pass.

## Automated Evidence

- `npm run check`: passed (22 unit tests and 7 migration assertions).
- `npm run test:integration`: passed (48 Worker+D1 assertions).
- JavaScript syntax, JSON parsing, WXML tag balance, WXSS brace balance, local image reference validation, and `git diff --check`: passed.
- Invitation token parsing and invite-code binary/JSON-error/temporary-file cleanup behavior checks: passed.
- WeChat Developer Tools compilation: both changed WXML files and all seven changed WXSS files passed individual compilation.
- Family cache cleanup and the owner dissolve confirmation flow were exercised with isolated behavior checks: passed.

## Evidence Limits

The implementation is no longer blocked by Developer Tools access. Keyboard-open modal behavior and additional 320 px/430 px runtime captures remain manual follow-up checks; they do not invalidate the captured 390 px result.

final result: passed
