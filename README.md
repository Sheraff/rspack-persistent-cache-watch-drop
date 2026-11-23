# Rspack: a persistent cache written by a watch session that dropped modules restores them

Reproduction for https://github.com/web-infra-dev/rspack/issues/TBD. Only `@rspack/core`.

`fixture/src/a.js` imports a small barrel (`src/dropped/index.js` → `x.js`, `y.js`). During `compiler.watch()`,
`a.js` is overwritten with `fixture/edited/a.js`, which has no imports, so the three `src/dropped/` modules leave the
graph. A later `compiler.run()` in a new process on the same `cache: { type: 'persistent' }` directory holds them again.
`src/b.js` is rebuilt in place with `compilation.rebuildModule()` at `finishMake` in the cold run and the watch session.
After that, the warm run's imports resolve to the wrong modules.

```sh
npm install
npm run repro         # cold run → watch session (a.js drops its import) → warm run
npm run control       # the final sources, built once with a fresh cache
npm run repro:panic   # same, with rebuildModule() in the warm run too (up to 5 attempts)
```

```
$ npm run repro
$ node build.mjs run --rebuild
  run: 0 errors, 3 modules of src/dropped/
$ node build.mjs watch --rebuild
  watch build 1: 0 errors, 3 modules of src/dropped/
  watch build 2: 0 errors, 0 modules of src/dropped/
$ node build.mjs run
  run: 2 errors, 3 modules of src/dropped/
    × ESModulesLinkingError: export 'one' (imported as 'one') was not found in './lib.js' (possible exports: x)

$ npm run control
$ node build.mjs run --rebuild
  run: 0 errors, 0 modules of src/dropped/

$ npm run repro:panic
attempt 1
...
$ node build.mjs run --rebuild
thread 'tokio-22' panicked at <redacted>:0:0:
should have connection
  exited with SIGABRT
```

- Expected: the warm run behaves like `control`: 0 errors and 0 modules of `src/dropped/`.
- The error varies between runs (`'one'`/`'two'` from `./lib.js`, `'y'` from `./y.js`, …), but "possible exports" always
  lists another module's exports.
- Without any `rebuildModule()` call, the warm run still holds the 3 dropped modules, but it links:
  `rm -rf app && mkdir app && cp -r fixture/src app/ && node build.mjs run && node build.mjs watch && node build.mjs run`
- `repro:panic` aborts in about half the attempts.

One step by hand: `node build.mjs run|watch [--rebuild]` (see the comment at the top of `build.mjs`). `app/` is the working copy.
