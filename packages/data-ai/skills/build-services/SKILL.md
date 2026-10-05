---
name: build-services
description: Build a feature's services/ layer — async data services (interface, create, createFake). Optional.
input: feature
output: feature
---

Skip if the feature talks to nothing outside itself.

Create one `services/<name>-service/` namespace per service: the interface (an async
data service, validated with `AsyncDataService.IsValid`), `create` (the
implementation, or a factory that throws when the app must inject it),
`createFake`, and `public.ts`. Add `services/services.ts` with the `Services` map when
spec actions inject services.

Depends only on `data/`. Gate: per-service unit tests.

The how is in the auto-loading `features/services/index.md` rule.
