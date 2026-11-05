---
glob: "**/*.test.ts"
---
- Name a test for the file it tests, beside it, with only the suffix added: `system.add-todo.test.ts` tests `system.add-todo.ts`, `<file>.browser.test.ts` for one that runs in a browser.
- `index.test.ts` tests a component through its interface; a test of the app as a whole sits at the source root.
