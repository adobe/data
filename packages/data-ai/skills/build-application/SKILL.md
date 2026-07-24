---
name: build-application
description: Build an application — a base feature hosting lazily-loaded peer features.
input: app
output: app
---

/build-feature (base — features/main)
|> /build-feature (each peer feature)
|> /build-app-entry
