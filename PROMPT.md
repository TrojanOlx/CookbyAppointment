# CookbyAppointment Animal-Island Mini Program Prompt

## Upstream Reference

This project adapts the visual language of `animal-island-vue` for a native WeChat Mini Program.

- Upstream repository: https://github.com/guokaigdg/animal-island-vue
- Upstream prompt: https://github.com/guokaigdg/animal-island-vue/blob/main/PROMPT.md
- Upstream usage guide: https://github.com/guokaigdg/animal-island-vue/blob/main/AI_USAGE.md
- Visual demo reference: https://guokaigdg.github.io/animal-island-vue/#/

The upstream prompt asks AI tools to create an Animal Crossing-style Vue 3 web interface, typically in a single `index.html`, using `animal-island-vue` components and its CSS package. That is the design reference, not the implementation target for this repository.

## Compatibility Boundary

Do not install, import, or wrap `animal-island-vue` in this project.

`animal-island-vue` is a Vue 3 web component library. CookbyAppointment is a native WeChat Mini Program using WXML, WXSS, TypeScript/JavaScript, native Mini Program components, and Mini Program package rules. Vue SFCs, DOM APIs, browser CSS assumptions, Vite output, and web component packages are not directly compatible with native Mini Program pages.

When upstream docs or the online demo conflict, treat the upstream repository docs/source as the authority for style intent and treat the demo as a visual reference only.

## Native Adaptation Rule

Do not generate Vue, HTML, JSX, React, or web-view UI for this repo. Generate WeChat Mini Program-compatible UI:

- WXML for structure.
- WXSS for styling.
- TypeScript/JavaScript only when behavior is required.
- Local images/SVGs under `miniprogram/images`.
- Reusable native components under `miniprogram/components`.

Backend APIs, cloud functions, data models, route paths, and business logic should stay unchanged unless a compile/runtime bug requires a focused fix.

## Visual Direction

The adapted theme is "家庭小岛餐厨": warm, playful, family food planning rather than a direct game clone.

Use these visual rules:

- Mint and sage island background with subtle dotted texture.
- Parchment cards, warm cream input surfaces, walnut text.
- Coral, yellow, teal, blue, and green meal/status accents.
- Thick soft shadows and raised pill buttons.
- Rounded cards, pill chips, friendly badges, visible empty/loading states.
- Food-first local assets: kitchen island hero, empty bowl, inventory basket, menu, appointment, review, admin, file, settings, and statistics icons.
- Avoid emoji placeholders and pure CSS-art illustrations when a local asset exists.

## Native Component Mapping

Use the local Mini Program implementation instead of upstream Vue components:

- `AButton` style -> `island-button` or `.island-btn`.
- `ACard` style -> `island-card`, `.island-surface`, or page card classes.
- `ATitle` style -> `island-title`, `.island-ribbon`, or page section title classes.
- Badge/status components -> `island-badge`, `.status-*`, `.meal-*`, `.dish-tag`.
- Tabs/chips -> `island-tabs`, `.type-item`, `.filter-item`, `.filter-tag`, `.range-tab`.
- Empty/loading -> `island-empty`, `island-loading`, `.empty-*`, `.loading-*`.

## Page Coverage

Apply the native island style consistently across:

- Home: hero, quick actions, today appointment, inventory warning, login prompt.
- Menu: category tabs, dish cards, dish detail, add/edit forms, upload areas, admin FAB.
- Appointment: `@lspriv/wx-calendar`, meal cards, status badges, action buttons, selection flow.
- Inventory: search, filter counters, swipe rows, expiry badges, add/edit form.
- Profile/settings/reviews/admin/statistics/files/privacy: passport-style profile card, grouped menu rows, rating visuals, statistics cards, file controls, privacy actions.

## WeChat Mini Program Check

Before relying on an upstream web component, verify whether it is native Mini Program compatible. For `animal-island-vue`, the answer is no for direct use:

- It depends on Vue 3 runtime/component semantics.
- It ships web-oriented CSS/component APIs.
- Native Mini Program WXML/WXSS cannot directly render Vue components.
- A web-view bridge would be a separate architecture and should not be used for this project unless explicitly requested.

The correct approach is native WXML/WXSS recreation of the visual language.
