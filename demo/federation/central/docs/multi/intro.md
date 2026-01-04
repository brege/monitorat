# Federation

Federation aggregates data from multiple monitor@ instances into a unified view.

## Architecture

```
       Central Head Node
      (public, proxies requests)
              │
      ┌───────┴───────┐
      ▼               ▼
   nas-1           nas-2
   :6601           :6602
```

## Configuration

```yaml
federation:
  enabled: true
  remotes:
    - name: nas-1
      url: http://localhost:6601
      api_key: "secret"
    - name: nas-2
      url: http://localhost:6602
      api_key: "secret"
```

## Display Strategies

- **columnate** - Side-by-side columns
- **stack** - Vertical sections
- **merge** - Combined unified view
