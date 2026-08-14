# deloom

English/[中文](./README_zh.md)

**deloom** is a JavaScript deobfuscation and unbundling toolkit. It turns minified, obfuscated, or bundled JavaScript — produced by **webpack**, **browserify**, **terser**, **esbuild** and others — back into readable code, using Babel AST transformations.

- **Uncompress** — beautify a single minified file: format code, fold constants, remove dead code, and *semantically rename* minified variables from their usage context.
- **Unbundle** — split **webpack** and **browserify** bundles into standalone CommonJS modules, with `require()` calls rewritten to relative paths.

## Features

- **Uncompress** — Decompress and beautify a single minified JavaScript file: formatting, constant folding, dead code removal, conditional expansion, sequence splitting, and more.
- **Semantic anchor propagation** — A distinguishing feature: minified names are renamed from surrounding semantic anchors, e.g. `{ options: e }` → `e` becomes `options`, `var o = this` → `self`, `new XMLHttpRequest()` → `xhr`, `self.playNoteAtNumber = n` → the function becomes `playNoteAtNumber`. Works even when the minifier stripped every meaningful name.
- **Unbundle** — Extract the module graph from **webpack** (runtime helpers `require.d` / `require.r` / ... restored as a helper module) or **browserify** (`[fn, depMap]` layout, dependency maps resolved) bundles into independent `.cjs` files.
- **Detect** — Identify the bundler type of a file before processing.
- Based on Babel parser and traversal, supports modern ECMAScript syntax.
- CLI and programmatic API (file-system free: pass content in, get content out).

## Installation

```bash
# Using pnpm (recommended)
pnpm add -D deloom

# Or using npm
npm install --save-dev deloom
```

Global install:

```bash
npm install -g deloom
```

## Quick Start

### 1. Uncompress a Single File

```bash
deloom uncompress input.js output.js
```

Reads `input.js`, beautifies it, and writes to `output.js`. Prettier is used for secondary formatting by default; pass `--no-prettier` to disable.

Options:

```
--no-prettier      Disable Prettier formatting
--no-pref          Disable the leading comment banner
--throw-errors     Throw errors during transformation (default: catch and fallback)
--no-timing        Disable performance timing output
```

### 2. Detect the Bundler

```bash
deloom detect input.js
# input.js: webpack
```

Outputs `webpack`, `browserify`, or `unknown`.

### 3. Unbundle a Bundle

```bash
deloom unbundle ./dist/chunks ./output
```

`./dist/chunks` is a directory containing one or more bundle files (e.g., `1.js`, `2.js`), and `./output` is the output directory. The tool auto-detects the bundler (webpack or browserify), parses all matching files, extracts the module definitions, and writes standalone `.cjs` files plus (for webpack) a `WebpackHelper.cjs` helper module.

Options:

```
--filter <pattern>  File filter pattern, default `*.js`
--no-log            Disable console logging
--no-clean          Do not clean the output directory before running
```

## API Usage

The package exposes three functions:

### `formatSource(source, options?)`

Beautify a JavaScript string or AST program.

```ts
import { formatSource } from 'deloom'

const code = `
var a=1,b=2;console.log(a+b);
`

const result = await formatSource(code, {
  usePrettier: true,
  throwErrors: false,
})

console.log(result)
// =>
// var a = 1;
// var b = 2;
// console.log(3);
```

### `detectBundle(content)`

Detect the bundler type of a bundle file's content.

```ts
import { detectBundle } from 'deloom'

detectBundle(source) // 'webpack' | 'browserify' | 'unknown'
```

### `unbundle(options)`

File-system free: pass file names and contents in, get generated files back. Writing to disk is left to the caller (the CLI does it for you).

```ts
import { unbundle } from 'deloom'

const result = await unbundle({
  sources: [
    { filename: './dist/chunks/1.js', content: source1 },
    { filename: './dist/chunks/2.js', content: source2 },
  ],
  log: true,
})

// {
//   type: 'webpack' | 'browserify',
//   files: { '3.cjs': '...', 'WebpackHelper.cjs': '...' },
//   tips: 'runtime_helper from 96365.cjs: require.e(853)',
// }
```

Files that fail to parse or do not match the detected bundle type are skipped instead of aborting the whole run.

## How It Works

### uncompress Transformations

A pipeline of Babel visitors is applied in order:

- Normalize string / numeric literal representations
- Constant folding (`1 + 2 * 3` → `7`, `'a' + 'b'` → `'ab'`, hex literals)
- Object property shorthand (`{a: a}` → `{a}`)
- Function expression to arrow function (`function(){}` → `() => {}`)
- Ternary to if/else (`cond ? a() : b()` → `if/else`)
- `a && a.b` → `a?.b`
- Promise executor parameter renaming (`(a, b)` → `(resolve, reject)`)
- try-catch parameter renaming (`e` → `caughtError`)
- `void 0` → `undefined`
- Sequence expression splitting (`(a(), b())` → `a(); b()`)
- Assignment extraction from expressions
- And many more...

### Semantic Anchor Propagation

Minifiers replace every meaningful name with `a`/`b`/`c`. deloom renames them back by propagating *anchors* — semantic information that survives minification:

| Anchor | Example | Result |
|---|---|---|
| Object key | `{ options: e, success: t, fail: n }` | `options` / `success` / `fail` |
| `this` alias | `var o = this` | `self` |
| Constructor type | `new XMLHttpRequest()` | `xhr` |
| Member assignment | `self.playNoteAtNumber = n` | `function playNoteAtNumber(...)` |
| Call-site argument | `foo(userList)` | the parameter becomes `userList` |
| Invoked parameter | `function (e) { e() }` | `callback` |
| Promise executor | `new Promise(function (e) {...})` | `resolve` |

Renames are scope-safe (collisions get numeric suffixes like `options1`) and only touch minified names, so readable code is never rewritten.

### unbundle Workflow

1. **Detect** the bundler type (`webpack` / `browserify`).
2. **Locate** the module table: a large object literal where every value is a module function (webpack) or a `[fn, depMap]` array (browserify).
3. **Detect roles** of each module function's parameters by *behavior* (called as callee → `require`, `.exports` access → `module`, ...), instead of assuming positions — this works for both `function(module, exports, require)` (webpack) and `function(require, module, exports)` (browserify).
4. **Rewrite** `require()` calls to relative paths (e.g., `require(3)` → `require('./3.cjs')`; browserify dep-map keys resolved to real module names).
5. **Replace** webpack runtime helper references (`require.d`, `require.r`, `require.n`, ...) with calls into the generated `WebpackHelper.cjs`.
6. **Strip** the bundler wrapper, keeping only the module body.
7. **Analyze** the dependency graph and **emit** each module as a `.cjs` file with a documentation banner (dependencies, referrers, unresolved references).

## Project Structure

```
├── src/
│   ├── cli.ts                  # CLI: uncompress / unbundle / detect
│   ├── index.ts                # Public exports
│   ├── uncompress.ts           # Uncompress pipeline (component merge)
│   ├── base.ts                 # defineComponent helper
│   ├── components/             # AST transform components (17)
│   │   ├── anchor-propagation.ts
│   │   ├── constant-fold.ts
│   │   └── ...
│   ├── helper.ts               # Webpack runtime helper code generation
│   └── unbundler/
│       ├── index.ts            # detectBundle + unbundle orchestration
│       ├── types.ts            # Shared types
│       ├── roles.ts            # CJS parameter role detection (behavior-based)
│       ├── webpack.ts          # Webpack strategy (locate + transform)
│       ├── browserify.ts       # Browserify strategy
│       └── extractor.ts        # Graph analysis + content generation
├── types/index.d.ts            # Type declarations
├── package.json
├── tsconfig.json
└── README.md
```

## License

Licensed under the **MIT** License.

This project is intended for learning and research purposes only. Do not use it to infringe upon the copyrights of others.

## Notes

- The unbundled output may contain unresolved references or warnings (`Tips`); always review the generated files.
- Bundler versions and plugin behaviors vary widely — some patterns may not be fully restored. Issues and pull requests are welcome.
