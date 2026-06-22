# SMART-ARF unit tests

Behavioral tests for the TypeScript port in `../lib/`, derived from the source
of truth in `smart-arf-app.html`. Covers scoring, interpretation tiers,
recommended actions, breakdown arrays, patient-code generation, and PII masking.

## Why a separate folder

The app build agent owns `package.json`, `package-lock.json`, and the root babel
config. To avoid any merge conflicts, this folder is **fully self-contained**:

- Its own `jest.config.js` with an **inline** babel transform (no external
  babel config is read or written).
- Runs via `npx`, so jest is installed to the npx cache — it never touches the
  project `package.json` or `package-lock.json`.

The transform reuses babel pieces already present in `node_modules`
(`@babel/preset-typescript`, `@babel/plugin-transform-modules-commonjs`,
`babel-jest`), so no new dependency needs to be installed into the project.

## Running

From the project root:

```bash
npx --yes jest@29 --config tests/jest.config.js
```

Run a single file:

```bash
npx --yes jest@29 --config tests/jest.config.js tests/lib/scoring.test.ts
```

Watch mode:

```bash
npx --yes jest@29 --config tests/jest.config.js --watch
```

## Later (once the app build agent is done)

Add a script to the root `package.json` and install jest as a devDependency so
the config can be simplified:

```jsonc
"scripts": {
  "test": "jest --config tests/jest.config.js",
  "test:watch": "jest --config tests/jest.config.js --watch"
},
"devDependencies": {
  "jest": "^29.7.0",
  "@types/jest": "^29.5.0"
}
```

## Layout

```
tests/
  jest.config.js        standalone config + inline babel transform
  tsconfig.json         editor/IDE support (not required to run)
  helpers/
    fixtures.ts         buildInputs() — emptyInputs() + patch
  lib/
    scoring.test.ts     scoring math, tiers, actions, breakdowns, patient codes
    format.test.ts      maskPhone / maskMRN / formatRecordDate / initials / …
    types.test.ts       emptyInputs() defaults & freshness
```

## Source of truth note

The TypeScript files port the scoring/PII logic from `smart-arf-app.html`.
Where the HTML's on-screen *display* renderers differ from the *saved-record*
shape, these tests assert against the saved-record shape (which is what the
TS port implements for both saving and display). In particular, the TS
`getActions` returns **plain text** (HTML tags stripped), and breakdown rows
use the saved-record labels (`'Heart Murmur'`, `'Prolonged PR interval'`, etc.).
