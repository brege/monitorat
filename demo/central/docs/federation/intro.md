# Federation

Federation enables a central monitor@ instance to aggregate data from multiple remote instances.

## Architecture

```
┌─────────────────────────────────┐
│       Central Head Node         │
│   (public, proxies requests)    │
└─────────┬───────────┬───────────┘
          │           │
          ▼           ▼
     ┌────────┐  ┌────────┐
     │ nas-1  │  │ nas-2  │
     │ :6601  │  │ :6602  │
     └────────┘  └────────┘
```

## Configuration

Define remotes in your config:

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

When merging data from multiple remotes, you control how each feature is displayed:

- **columnate**: Side-by-side columns, one per remote
- **stack**: Vertical sections, one per remote
- **merge**: Combined into a single unified view
