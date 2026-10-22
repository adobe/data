---
name: build-feature
description: Build a complete feature step by step
input: feature
output: feature
---

If the feature already has `data/state/` or `services/main-service/`, it uses the legacy
state-based layout: extend it in place per those legacy rules; don't migrate it unless asked.

/graph-execute
    /build-data
    /build-services
    /build-spec
    /build-core-database
    /build-indexes
    /build-transactions
    /build-service-database
    /build-computed
    /build-actions
    /build-systems
    /build-ui
