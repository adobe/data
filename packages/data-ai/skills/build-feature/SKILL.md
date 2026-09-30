---
name: build-feature
description: Build a complete feature step by step
input: feature
output: feature
---

/graph-execute
    /build-data
    /build-services
    /build-spec
    /build-core-database
    /build-indexes
    /build-transactions
    /build-computed
    /build-service-database
    /build-actions
    /build-systems
    /build-ui
