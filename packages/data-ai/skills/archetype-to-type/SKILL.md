---
name: archetype-to-type
description: Use when invoked or when editing types backed by archetypes.
paths:
  - '**/*types*'
---

@see /archetypes /namespace /structure /types

A type is derived from an archetype using @adobe/data Schema.fromArchetype

The components arguments should come from `import * as components from` the barrel exporta index.ts of the corresponding components declarations.

fn execute() {
    if not provided specific instructions then for each archetypes in the relevant archetypes folder {
        create ../../types folder (it is a peer)
        create archetypes peer types folder if missing
        create a /namespace adhering type declaration in types folder
    }
}
