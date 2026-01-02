**Configuration:**

```yaml
{{file:snippets/61-metrics-combined.yaml}}
```

The `federation.merge` directive specifies which remotes to combine. The `display.tiles: columnate` shows each remote's tiles side-by-side.

Available display strategies for tiles:
- `columnate` - side-by-side columns
- `stack` - vertical sections
- `merge` - combined view (default)
