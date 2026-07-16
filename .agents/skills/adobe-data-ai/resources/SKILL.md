---
name: resources
description: Use when discussing or editing ECS resources
paths:
  - '**/*resources*'
---

Review samples: ../structure/references/data/resources/*.ts

Resources are just singleton components. In fact, they are implemented in the adobe ECS database core as just components.

The difference is since there is only ever one entity which contains a single resource as it's only component, we are never concerned about efficient linear memory storage.

@see ../components/SKILL.md
