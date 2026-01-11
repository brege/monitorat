# Plan

## Phase 1: Layout math and section headers (functionality first)

- Audit tile layout math in `static/app.js` and `themes/default.css` to 
  identify where auto-fit and `--layout-group-min` change row selection.
- Define a symmetric tile rule: once a row break is chosen, size tiles to
  consistent widths across the row and prevent text wrapping within tiles.
- Legitimize Section Headers by migrating the legacy widget-header typography
  and spacing into the section header styles; remove top-level widget header
  rules from widgets while keeping `feature-header` for subwidgets, which are
  also used for federation node badges (acting like [tags]).
- Ensure all subwidgets are represented in `demo/layout/config.yaml` and that
  they all behave with the same buffers against the section header.

## Phase 2: Config-driven subwidget sizing

- Move per-widget `--widget-min-width` defaults into each widget’s 
  `default.yaml`.
- Read the per-widget min width from config and apply it as a CSS custom
  property on the widget root.
- Keep CSS theme overrides valid so themes can still override min width if
  needed.

## Phase 3: CSS cleanup and widget-local styles

- Move each widget's CSS from `widgets/*/index.html` to `widgets/*/style.css`
- Move widget-specific CSS out of `themes/default.css` into each widget’s
  `index.html` style section.
- Consolidate duplicate CSS rules between `widgets/*/style.css` into shared
  rules in `themes/default.css`.
- Update `themes/formal.css` for any adaptions to the new paradigm.
