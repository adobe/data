# Feature structure

Each feature folder contains layered subfolders. Higher layers may import from lower layers; never the reverse.

```mermaid
flowchart TB
    elements --> database
    database --> types
    database --> services
    types <--> services
    types --> data
    services --> data
```

| Folder | Role |
|--------|------|
| `data/` | Archetypes, components, resources — ECS shape definitions |
| `types/` | Pure immutable data and synchronous helpers |
| `services/` | Async capability contracts and implementations |
| `database/` | ECS database wiring and persistence |
| `elements/` | UI |

`types/` and `services/` are peers at the same tier: both may import `data/`, and may import each other. `database/` may import either or both. `elements/` sits at the top and imports `database/`.
