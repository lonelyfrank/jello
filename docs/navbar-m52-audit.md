# M5.2 audit and implementation plan

Audit performed against the local M5.1 implementation before code changes.

- `navbar-contract.ts` already owns stable item IDs, groups, select/navigate/consumer actions, safe destinations, visibility, disabled state and selection fallback. `navbar-desktop.ts` validates Desktop fields and root-ID region assignments and resolves canonical maxWidth breakpoints (narrowest wins).
- Desktop has a validated v1 definition but is explicitly unimplemented in DEFINITION_TYPES, COMPONENTS and runtime/components. The starter currently contains legacy href payloads, not explicit navigation actions. The runtime must preserve the distinction.
- Mobile's derived view contains only item nodes, so it cannot supply Desktop brand/actions or geometry. Desktop needs its own DOM and region resolution. Shared style descriptors/presentation can be reused without sharing Mobile DOM.
- MaterialBinding already owns registry dispatch, stable surface facades, family changes, source/group ownership and cleanup. Reuse it; never recreate Glass/Solid. As on Mobile, the whole bar is one surface: per-item pressed/active/disabled visuals belong to the component, not whole-bar material state.
- ComponentInstance defines mount/unmount/update/destroy, status, previewState and node lookup. Mobile callbacks use stable IDs plus previous/value/index/trigger, with onAction for all three action kinds. Controlled mode reports change and waits for the owner. Native navigate and consumer do not select.
- Stage currently constructs BottomNavigation for every non-Button definition. Builder treats every non-Mobile as Button. Both require small dispatch/preview changes, not a new Stage or React renderer.
- React/Vanilla builders already reject types lacking their capability. Desktop must advertise JSON only until M5.3; adapter descriptions must also reject it.
- Existing unit tests assert Desktop is planned. Update those assertions while retaining the Mobile/legacy/export checks. Existing Playwright fixtures can exercise the built public runtime independently from Studio routing.

## Plan

1. Add pure Desktop region/presentation helpers and a dedicated DesktopNavigation implementing ComponentInstance, validating before resources are allocated or live state changes.
2. Render Start/Main/End from canonical root assignments, flatten logical groups with data attributes, reconcile controls by ID and preserve or repair focus.
3. Implement actions, controlled/uncontrolled selection, reselect, press/hover/focus events, preview states and keyboard navigation. Render a named nav; report tabs as unsupported because v1 has no panel association contract.
4. Resolve container-width breakpoints, use scrollable navigation with a whole-row fallback at extreme widths; compress hides labels and still scrolls when necessary. Apply shared style values to dedicated Desktop CSS, through MaterialBinding for Glass/Solid.
5. Register real runtime/JSON capability, expose public types, add a generic serializable template, and connect a clearly labeled technical preview to the existing Stage. Keep full Desktop editing and framework export adapters for M5.3.
6. Add unit/public-runtime/Playwright tests and docs; run typecheck, unit suite, build, targeted Desktop/Mobile E2E and existing React/Vanilla consumers. Report actual engines and environment limitations.

No schema version change and no changes to Mobile/Button public APIs are planned. Desktop positioning is in normal flow: v1 Desktop intentionally excludes anchor/placement/offset. Region visibility is not a v1 property. Icons support builtin/sanitized SVG only; arbitrary remote images are not part of the asset contract.
