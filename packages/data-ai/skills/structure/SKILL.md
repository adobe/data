---
name: structure
description: Use when laying out or reasoning about a feature's file/folder structure and layer dependencies.
---

Feature code follows the feature-folder pattern. See **`features/index.md`** for the
layering (`ui → ecs → services → data`, higher imports lower), the dependency rules,
and how the layers compose; each folder's own rule covers how to author it. Worked
examples: the `data-lit-todo` and `data-lit-tictactoe` sample features.
