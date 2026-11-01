# ecs-guide-checks

The checks every package's guide chapters pass, for its `src/guide/guide.test.ts`:

```ts
checkChapters({ folder: new URL(".", import.meta.url), teaches, mutations });
```

- **Files:** each program has its prose and its `.out`, and the guide's index lists every chapter, numbered as its
  files are and titled as its prose is.
- **Output:** each program prints what its `.out` says, its package's version left out of ids.
- **Teaching:** each chapter's prose shows, as code, what `teaches` says it teaches, and its program uses it.
- **Mutations:** each of `mutations` takes a point away from a program, and its output must change, to the failure
  given where there is one.
- **Links:** the prose links only to chapters there are, and to whole lines of code of its own program.
