---
paths:
  - "**/entry.*.ts"
---
<!-- Written by `ecs-architecture agents` from the rules of @adobe/ecs-architecture and @adobe/ecs: run it again, never edit. -->

- An entry is the only module that runs code as it loads: what a page's `<script type="module" src>`, a worker's script or a node script loads. It sits at the root of the layer whose imports it needs, exports nothing, and its index doesn't re-export it.
- It holds its own start-up, read top to bottom, in a local function when it returns early, its helpers beneath it as function declarations; what a test also needs, such as starting the app within any root, is declared in its layer.
