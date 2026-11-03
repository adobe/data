---
applyTo: "**/rule.*.ts"
---
<!-- Written by `ecs-architecture agents` from the rules of @adobe/ecs-architecture and @adobe/ecs: run it again, never edit. -->

- `Rule.create({ components: { with, not }, derive: [component] })` keeps a `derived: true` component on exactly the entities its query matches; nothing adds or removes it otherwise.
