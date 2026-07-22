---
name: build-feature
description: Build a complete feature by piping the per-layer build-* skills bottom-up.
input: feature
output: feature
---

/build-data
|> /build-services
|> /build-core-database
|> /build-indexes
|> /build-transactions
|> /build-computed
|> /build-service-database
|> /build-actions
|> /build-ui

Run with /x-execute. Each step is a no-op for a layer the feature doesn't use.
