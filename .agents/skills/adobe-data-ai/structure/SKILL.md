---
name: structure
description: Use when deciding on file/folder layout and/or dependencies such as tsconfig files, package boundaries, and related project structure.
---

@see ./references/**/*.ts

constraints on every file unless explicitly overridden {
    - exports exactly one declaration
    - is kebab-case matching export name
}

Code is organized primarily by feature.

A typical application structure may look like this:

    my-application-repo/
        src/
            main/      # the main feature folder
            features/  # name may vary, logical organization of sub features
                feature1/  #
                logical-sub-features/
                    feature2/
                    feature3/

Folders may be used to logically organize features, but no source code files live outside of feature folders. README files, ai guidance may live at the logical levels provided it applies to all logical child features.

The structure for every feature folder looks like this, and is also provided in our ./references/*

    data/
        archetypes/
            <archetype-name-one>.ts
            <archetype-name-two>.ts
        components/
            <component-name-one>.ts
            <component-name-two>.ts
        resources/
            <resource-name-one>.ts
            <resource-name-two>.ts
    types/
        # pure data + sync helpers; @see /types
        archetype-name-one/
        archetype-name-two/
        some-other-type-one/  # types not derived from archetypes also allowed here
        some-other-type-two/
    services/
        # async ports; @see /services
        workspace-persistence-service/
        character-name-service/
    database/
        # TODO
    elements/
        # TODO

## Dependencies

Allowed import direction only (enforce per folder with tsconfig):

    elements → database → (services ↔ types) → data
