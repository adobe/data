---
name: aidd-namespace
description: Folder-internal namespace pattern for types/ and services/ entries. Use when creating, refactoring, or importing namespaced types and services.
---

@see /archetypes
@see ../structure/references/types/*.ts

This pattern creates a single importable name that combines both the type and a namespace of related declarations.

A consumer of the type will `import { TypeName } from "path/to/type-name/type-name.js"` and then can use the type with `TypeName` or use any public declarations related to the type with `TypeName.someDeclaration`.

This pattern provides strong typing, discoverability and tree shaking with modern bundlers. Any public declaration not consumed by an application will be omitted from the bundle.

Namespace file structure:

    <name>/
        <name>.ts
            // export type <Name> = ?
            // export * as <Name> from "./public.js";
        public.ts
            // export * from "./public-const1.js";
            // export * from "./public-function1.js";
            // export * from "./public-function2.js";
        // declarations follow, each contains EXACTLY one public export per file
        // each function declaration has a unit test file with ZERO public exports
        // declaration files may have any number of private declarations
        // we only move them out to their own files if needed by two or more other declaration files
        <public-const1>.ts
        <internal-const2>.ts
        <public-function1>.ts
        <public-function1>.test.ts
        <public-function2>.ts
        <public-function2>.test.ts
        <internal-function1>.ts
        <internal-function1>.test.ts

IMPORTANT NOTE: If a single declaration grows too large to manage conveniently within a single file then it can be converted into a single folder containing multiple files, but only the file of the same name as the folder is considered public and that will be exported from the public.ts  For example `export * from "./my-large-declaration/my-large-declaration.js"; This is most common with large service factory functions. We do this for proper cohesion. It avoids cluttering up the shared file space with unrelated implementation details.

The namespace pattern *may* recurse by containing sub-folders of namespaced types that are re-exported by the containing type. This can make for convenient and discoverable related types.

For example, a service interface type may contain it's related types as child types for easy consumption.

    import { MyService } from "./my-service/my-service.js";

    const myInput: MyService.Input = { foo: 1 };
    const myOutput: MyService.Output = await MyService.create().doSomething(myInput);

consumer constraints {
  - never directly import `public.js`
  - never use `import type` as that omits the namespaced declarations
  - never directly import a namespace typed declaration file
}


## Execute

fn whenRefactoringASingleFileToNamespacePattern() {
  Constraints {
    Identify constants in the current file
    Extract them into the standard pattern
    Identify all consumers of public namespaces
    Check each consumer for correct consumption pattern
    Ensure unit tests exist per function file
  }
}
