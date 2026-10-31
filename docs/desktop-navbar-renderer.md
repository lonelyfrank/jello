# Desktop Navbar Renderer · M5.2

`DesktopNavigation` renders a canonical `desktop-navbar` in the shared framework-independent runtime. The Studio Stage mounts this same renderer through `createComponent`; there is no React rendering implementation. [Initial audit and plan](navbar-m52-audit.md).

## Public API

```ts
import {
  componentTemplate, isNavbarDefinition, mountComponent, switchMaterialFamily,
} from '@jello/runtime';
import '@jello/runtime/jello.css';

const config = componentTemplate('desktop-navbar')!.create();
if (!isNavbarDefinition(config) || config.type !== 'desktop-navbar') throw new Error('Desktop required');
const nav = mountComponent({
  container: document.querySelector<HTMLElement>('#navigation')!,
  config,
  // source: opaque content behind the bar, for Glass refraction.
  // Without source, Glass uses the existing CSS backend/fallback.
  onChange: (id, event) => console.log(id, event.previous),
  onAction: (id, event) => console.log(id, event.action, event.value),
});
nav.setActiveItem('projects');
nav.update(switchMaterialFamily(nav.component, 'solid').definition);
nav.unmount();
nav.mount();
nav.destroy();
```

`createComponent(options)` creates an initially hidden instance; `mountComponent(options)` also mounts it. Both use the existing runtime registry. `DesktopNavigation`, `DesktopNavigationOptions`, `DesktopNavigationEvent`, `DesktopNavigationActionEvent` and `DesktopNavigationStatus` are public exports.

| API | Behavior |
| --- | --- |
| `component`, `host`, `mounted`, `status` | Current normalized definition, created nav, mount state, material/breakpoint/overflow/unsupported diagnostics |
| `activeItem`, `setActiveItem(id)` | Read selection; set an available item without emitting a user change. Navigate items can be marked current by the router. |
| `activeTab`, `setActiveTab(id)` | Aliases for existing Stage handlers |
| `elementFor(id)`, `nodeAt(target)` | Stable ID lookup for Stage highlighting; root is `root` |
| `regions.start/main/end` | Region DOM elements for measurement/inspection |
| `update(definition)` | Validate first, then reconcile by stable ID, repair selection/focus and update material/responsive/layout |
| `setInteractive(bool)` | Enable input or use the existing Stage pick mode |
| `previewState(id, state)` | Preview hover/pressed/focus/active/disabled; null clears it |
| `materialSurface`, `glassSurface`, `materialGroup` | Existing MaterialBinding facade/Glass diagnostics |
| `mount`, `unmount`, `destroy` | Idempotent lifecycle. Destroy is terminal. |

Options include `container`, `config: DesktopNavbarDefinition`, `source`, externally owned Glass `group`, `backend`, `scroller`, `label`, `controlled`, `activeItem` (or `activeTab`), `onChange`, `onAction`, `onReselect`, `onTabPress`, `onHover`, `onFocus`. Selection options only establish initial state; controlled applications subsequently call `setActiveItem`.

Callbacks receive `(id, event)`. Every event includes `itemId`, legacy-compatible `tabId`, `previous`, `value`, definition-order `index` and `trigger: pointer|keyboard|api`. `onAction` also includes the canonical `action`, including the consumer action's `name`. IDs identify controls; index/value never identify them. Callback functions live in runtime options, never in serialized documents.

All activations emit `onAction`/the configured action event. Select items additionally emit change or reselect. Consumer and navigate activations preserve selection. Brand/action nodes are not selection candidates; their actions are still reported. `controlled: true` emits change and leaves selection to the owner. Invalid/hidden/disabled/consumer IDs are refused as selection targets. Structural changes apply the shared available-item/default/display-order fallback.

DOM event names come from `interactions.events`; absent action/hover/focus names fall back to `jello-action`, `jello-hover`, `jello-focus`. The other canonical defaults are `jello-change`, `jello-press`, `jello-reselect`.

## DOM and semantics

```text
nav.jello-dnav[aria-label]
  span.jello-surface OR span.jello-solid  (owned by MaterialBinding)
  div.jello-dnav-row
    div.jello-dnav-region[data-region=start]
    div.jello-dnav-region[data-region=main]
    div.jello-dnav-region[data-region=end]
      a.jello-dnav-item[data-item] OR button.jello-dnav-item[data-item]
        svg.jello-dnav-icon[aria-hidden=true]?
        span.jello-dnav-label
```

`layout.regions` assigns root child IDs. Unassigned roots default to Main. Group members inherit the group's region and render in order as ordinary controls, carrying `data-group`; no dropdown or empty group control is created. Controls also carry `data-role`, optional `data-value`, `data-icon-position`, and transient `data-active`/`data-pressed`/`data-preview-state`.

The root is a named `nav`. Navigate actions use real links with validated hrefs, native Enter/click navigation, `_self`/`_blank`, and `noopener noreferrer` for `_blank`. Disabled links retain link semantics, lose href and leave the Tab sequence. Select/consumer actions use real buttons; disabled buttons use native disabled plus aria-disabled. Hidden entries leave the DOM. All controls have accessible names even when labels/icons are visually hidden.

Normal Tab/Shift+Tab order is preserved across regions. Optional Left/Right (including RTL), Home/End move focus among available controls without selecting; Enter/Space activate buttons, Enter activates links, Space on a link retains native scrolling. Focus survives label, reorder, group, region and material updates through stable IDs. Replaced/removed/disabled focused controls fall back to current selection or the first available control, then the nav. No keyboard trap or global key handler is installed.

**Tabs are unavailable in this renderer.** A schema-valid `semantics: tabs` definition is refused before allocating resources or updating the live instance. v1 has no tab-to-panel association. A future tabs contract must provide unique control/panel IDs, `aria-controls`/`aria-labelledby`, panel visibility/lifecycle and activation mode before claiming tab semantics. Navigate links cannot masquerade as tabs.

## Layout, responsive and overflow

Desktop uses normal document flow. `align` places a narrower bar within its container, `widthMode` supports fill/fixed/hug constrained to available space, and `maxWidth` bounds fill. Height, horizontal padding, gap, numeric/capsule radius, inline/stacked content, icon position (start/end/top/bottom), label mode, icon visibility and compact mode come from the canonical fields. Compact caps horizontal padding at 8px and gaps at 4px; item padding reduces to 6px. Controls retain a minimum 44px target. At configured heights below 44px, vertical overflow remains scrollable rather than removing controls.

Start and End preserve intrinsic width when possible; Main takes the remaining space. Distribution applies to Main: start/center/end/between/evenly. Safe center/end prevent inaccessible leading content on overflow. Per-item typography/icon overrides remain keyed by item ID. The brand text/icon is consumer data, never a fixed product logo. Supported icons are builtin or sanitized SVG. The existing contract has no arbitrary remote image URL or upload pipeline.

`resolveDesktopNavbar(definition, containerWidth)` applies canonical breakpoints from broadest maxWidth to narrowest. A ResizeObserver watches the actual layout container and host; window resize is also observed. Overrides cover labels/icons, gap/padding, height/width/maxWidth, alignment/distribution, compact, font size and icon size. Desktop has no anchor/placement/offset, orientation is horizontal only, and responsive region visibility is not in v1.

Main scrolls horizontally when necessary, preserving every control and native focus scrolling. `responsive.overflow: compress` first hides Main labels only when natural content does not fit, retaining names; it still scrolls if controls do not fit. Scrollbars remain available. If Start/End plus Main's minimal usable width exceed the bar, the entire row also scrolls. At extreme widths fixed regions cannot all remain visible simultaneously; every control is reachable by scroll/focus. No overlapping controls, automatic dropdown, hamburger or conversion to Mobile is introduced.

## Materials and visual states

The bar is one MaterialBinding surface, not one lens per control. Glass uses the existing registry renderer, source refraction, press light, CSS/fallback paths, reduced transparency/motion and resource ownership. Solid uses its own fill/border/radius/shadow/elevation and hover overrides. Changing material updates the binding without replacing the controls or their identity.

Default/hover/pressed/active/focus/disabled use the shared component descriptors and per-item overrides. The indicator is a customizable per-control pseudo-element (`pill|none`, color/inset, radius); motion controls its color transition, not a sliding Mobile lens. Focus uses a configured outline with contrasting inner rings; forced-colors supplies system colors. Reduced motion disables transitions/content scale.

As with Mobile, a single pressed/active/disabled item does not put the whole Solid bar in that material state. Use component state styles; such material overrides are preserved and explicitly reported in `status.reasons`. Whole-bar hover is forwarded to MaterialBinding. On Solid the inherited unsupported-property table reports foreground (use material content color), indicator color (uses active tint), Glass text shadow and Glass press feedback. No unsupported field is silently advertised as rendered.

## Lifecycle and ownership

Construction validates before appending DOM/creating material resources. Update validates and resolves the next material before mutating the instance. Input listeners and ResizeObserver belong to a mounted instance and are removed on unmount. Unmount detaches the surface, resets press/hover and hides the nav. Remount attaches once. Destroy unsubscribes status, destroys the binding and owned groups, removes the created host and clears control references. A supplied Glass group remains owned by its caller. Container attributes/styles are not changed. Destroyed instances cannot be revived.

## Studio and M5.3

Open `?workspace=builder&component=desktop-navbar`. The existing Stage uses the shared runtime and includes the generic Your brand / Home / Explore / Projects / Settings / Action template. Existing material controls switch Glass/Solid; existing viewport controls resolve breakpoints. A clearly labeled technical preview selects a control and shows states. JSON import updates content/structure/layout; JSON export and normal persistence remain available.

M5.3 owns the complete Desktop structural/layout Inspector, visual editor and React/Vanilla package adapters. COMPONENTS advertises JSON only; both adapter descriptions and package builders reject Desktop framework exports. The built public runtime already contains Desktop independently of React/editor/storage. Mobile/Button exports remain supported.

Validation: [compatibility matrix](compatibility.md). No schema/IndexedDB version change or Mobile/Button API breaking change.

## Visual Builder and exports · M5.3

The visual editor now exposes this renderer in the existing Builder, contextual Inspector and shared Stage. The canonical structure, brand/actions, regions/groups, styles, material and container breakpoints are editable without JSON. Selection is bidirectional; logical groups highlight their visible members without generating runtime controls. Overflow and the effective breakpoint are visible in the Canvas.

React and Vanilla packages use the same built runtime. React exposes configuration, controlled/uncontrolled activeItem, selection/action/press/reselect/hover/focus callbacks and material source refs; Vanilla mount returns the dedicated typed DesktopNavigation instance. Both include canonical and resolved material documents, CSS/types, working examples, README and hashed manifests. Brand and action typography overrides survive validation as well as runtime updates. [M5.3 delivery and verification](navbar-m53-delivery.md).
