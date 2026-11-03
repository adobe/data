---
applyTo: "**/index.*.ts"
---
<!-- Written by `ecs-architecture agents` from the rules of @adobe/ecs-architecture and @adobe/ecs: run it again, never edit. -->

- `Index.create({ key: [cell], components: { with: [...] } })`, read by a system's `lookup`. Every structural change updates an index, so define one only for what a query can't do: look up by key, or read a set inside another system's body.
