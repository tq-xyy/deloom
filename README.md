# deloom

**deloom** unwears the loom of webpack bundling. It is a tool for **uncompressing** and **unbundling** JavaScript files produced by bundlers and minifiers like **webpack**, **terser**, and others. Using Babel AST transformations, it recovers obfuscated or compressed code into a more readable form and disassembles webpack bundles into standalone CommonJS modules.

## Features

- **Uncompress** — Decompress and beautify a single minified JavaScript file: format code, fold constants, remove dead code, expand conditional expressions, and more.
- **Unbundle** — Extract the module graph from one or more webpack bundle files (e.g., `1.js`, `2.js`) into independent `.cjs` files, along with the required webpack runtime helper code.
- Based on Babel parser and traversal, supports modern ECMAScript syntax.
- CLI and programmatic API.

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
--throw-errors     Throw errors during transformation (default: catch and fallback)
--no-timing        Disable performance timing output
```

### 2. Unbundle a Webpack Bundle

```bash
deloom unbundle ./dist/chunks ./output
```

Where `./dist/chunks` is a directory containing one or more bundle files (e.g., `1.js`, `2.js`), and `./output` is the output directory. The tool parses all matched files, extracts the module definitions, and generates standalone `.cjs` files plus a `WebpackHelper.cjs` helper module.

Options:

```
--filter <pattern>  File filter pattern, default `*.js`
--no-log            Disable console logging
--no-clean          Do not clean the output directory before running
```

## API Usage

The package exposes two main functions:

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

### `unbundle(options)`

Unbundle webpack bundle files.

```ts
import { unbundle } from 'deloom'

await unbundle({
  entries: ['./dist/chunks/1.js', './dist/chunks/2.js'],
  output: './output',
  log: true,
})
```

## How It Works

### uncompress Transformations

A pipeline of Babel visitors is applied in order:

- Normalize string / numeric literal representations
- Constant folding (`1 + 2 * 3` → `7`)
- Object property shorthand (`{a: a}` → `{a}`)
- Function expression to arrow function (`function(){}` → `() => {}`)
- Ternary to if/else (`cond ? a() : b()` → `if/else`)
- Logical expression to if (`a && b()` → `if (a) { b() }`)
- Promise executor parameter renaming (`(a, b)` → `(resolve, reject)`)
- try-catch parameter renaming (`e` → `caughtError`)
- `void 0` → `undefined`
- Sequence expression splitting (`(a(), b())` → `a(); b()`)
- Assignment extraction from expressions
- And many more...

### unbundle Workflow

1. **Parse** each bundle file and locate the main module object (a large `ObjectExpression` where every property is a module function).
2. **Traverse** each module function, identify `require()` calls and webpack runtime helpers (`require.d`, `require.r`, `require.n`, etc.).
3. **Rewrite** module numeric IDs to relative paths (e.g., `require(3)` → `require('./3.cjs')`).
4. **Replace** webpack runtime helper references with calls to `WebpackHelper.cjs`.
5. **Strip** the webpack wrapper, keeping only the module body.
6. **Analyze** dependency graphs.
7. **Emit** each module as a separate `.cjs` file with a documentation banner, and generate `WebpackHelper.cjs`.

## Project Structure

```
├── bin/
│   └── cli.ts               # CLI entry point
├── src/
│   ├── index.ts             # Exports formatSource and unbundle
│   ├── uncompress.ts        # Core uncompression logic (AST transforms)
│   ├── unbundler.ts         # Unbundling core (Extractor class)
│   ├── helper.ts            # Webpack runtime helper code generation
│   └── deps.d.ts            # Type declarations
├── package.json
├── tsconfig.json
├── .prettierrc.json
└── README.md
```

## License

Licensed under the **MIT** License.

This project is intended for learning and research purposes only. Do not use it to infringe upon the copyrights of others.

## Notes

- The unbundled output may contain unresolved references or warnings (`Tips`); always review the generated files.
- Webpack versions and plugin behaviors vary widely — some patterns may not be fully restored. Issues and pull requests are welcome.
