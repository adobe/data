---
glob: "**/rule.*.ts"
---
- `Rule.create({ components: { with, not }, derive: [component] })` keeps a `derived: true` component on exactly the entities its query matches; nothing adds or removes it otherwise.
