---
name: build-application
description: Build an application — a base feature hosting lazily-loaded peer features.
input: app
output: app
---

/graph-execute
    /build-feature (base — features/main)
    for each sub feature
        /build-feature
    /build-app-entry
