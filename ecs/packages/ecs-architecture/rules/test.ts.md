---
glob: "**/*.test.ts"
---
- Name a test for the file it tests, beside it, with only the suffix added: `system.add-todo.test.ts` tests `system.add-todo.ts`, `<file>.browser.test.ts` for one that runs in a browser.
- `index.test.ts` tests a component through its interface; a test of the app as a whole sits at the source root.
- A test needing what a component keeps private imports the file by its path; a test import never makes an export public.
- A test exports nothing, and there are no `*.test-helper.ts` files: helpers several tests share are test features, in the `test/` of the lowest feature whose tests share them, one declaration per file, imported through their `index.ts`; only tests import them.
