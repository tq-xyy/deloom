# deloom

[English](./README.md)/中文

**deloom** 是一个 JavaScript 反混淆与解包工具集。它将由 **webpack**、**browserify**、**terser**、**esbuild** 等工具生成的压缩、混淆或打包的 JavaScript 代码，通过 Babel AST 转换恢复为可读形式。

- **解压缩** — 美化单个压缩文件：格式化代码、常量折叠、删除死代码，并根据使用上下文**语义化重命名**被压缩的变量名。
- **解包** — 将 **webpack** 与 **browserify** 打包产物拆分为独立的 CommonJS 模块，`require()` 调用重写为相对路径。

## 特性

- **解压缩** — 解压缩并美化单个被压缩的 JavaScript 文件：格式化、常量折叠、删除死代码、条件表达式展开、序列表达式拆分等。
- **语义锚点传播** — 核心特色：从幸存于压缩的语义锚点反向重命名压缩名，例如 `{ options: e }` 中的 `e` 改为 `options`、`var o = this` → `self`、`new XMLHttpRequest()` → `xhr`、`self.playNoteAtNumber = n` → 函数改名为 `playNoteAtNumber`。即使压缩器删掉了所有有意义的名称也能恢复。
- **解包** — 从 **webpack**（运行时辅助函数 `require.d` / `require.r` / ... 还原为辅助模块）或 **browserify**（`[fn, depMap]` 结构、依赖表解析）打包产物中提取模块图为独立的 `.cjs` 文件。
- **检测** — 处理前识别文件的打包器类型。
- 基于 Babel 解析器和遍历，支持现代 ECMAScript 语法。
- CLI 与编程式 API（与文件系统解耦：传入内容、返回内容）。

## 安装

```bash
# 使用 pnpm（推荐）
pnpm add -D deloom

# 或使用 npm
npm install --save-dev deloom
```

全局安装：

```bash
npm install -g deloom
```

## 快速开始

### 1. 解压缩单个文件

```bash
deloom uncompress input.js output.js
```

读取 `input.js`，美化后写入 `output.js`。默认使用 Prettier 进行二次格式化；传入 `--no-prettier` 可禁用。

选项：

```
--no-prettier      禁用 Prettier 格式化
--no-pref          禁用文件头部说明注释
--throw-errors     转换过程中抛出错误（默认：捕获错误并回退）
--no-timing        禁用性能计时输出
```

### 2. 检测打包器类型

```bash
deloom detect input.js
# input.js: webpack
```

输出 `webpack`、`browserify` 或 `unknown`。

### 3. 解包打包文件

```bash
deloom unbundle ./dist/chunks ./output
```

`./dist/chunks` 是包含一个或多个打包文件（如 `1.js`、`2.js`）的目录，`./output` 是输出目录。工具自动检测打包器类型（webpack 或 browserify），解析所有匹配的文件，提取模块定义，并写入独立的 `.cjs` 文件；webpack 产物还会生成 `WebpackHelper.cjs` 辅助模块。

选项：

```
--filter <pattern>  文件过滤模式，默认为 `*.js`
--no-log            禁用控制台日志输出
--no-clean          运行前不清空输出目录
```

## API 用法

该包暴露三个函数：

### `formatSource(source, options?)`

美化 JavaScript 字符串或 AST 程序。

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

检测打包文件内容的打包器类型。

```ts
import { detectBundle } from 'deloom'

detectBundle(source) // 'webpack' | 'browserify' | 'unknown'
```

### `unbundle(options)`

与文件系统解耦：传入文件名与内容，返回生成的文件。落盘交给调用方（CLI 已替你完成）。

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

无法解析或与检测到的类型不匹配的文件会被跳过，而不是中止整个流程。

## 工作原理

### 解压缩转换

按顺序应用一系列 Babel 访问器：

- 规范化字符串/数值字面量表示
- 常量折叠（`1 + 2 * 3` → `7`、`'a' + 'b'` → `'ab'`、十六进制字面量）
- 对象属性简写（`{a: a}` → `{a}`）
- 函数表达式转为箭头函数（`function(){}` → `() => {}`）
- 三元表达式转为 if/else（`cond ? a() : b()` → `if/else`）
- `a && a.b` → `a?.b`
- Promise 执行器参数重命名（`(a, b)` → `(resolve, reject)`）
- try-catch 参数重命名（`e` → `caughtError`）
- `void 0` → `undefined`
- 序列表达式拆分（`(a(), b())` → `a(); b()`）
- 从表达式中提取赋值语句
- 以及更多……

### 语义锚点传播

压缩器把每个有意义的名称替换成 `a`/`b`/`c`。deloom 通过传播*锚点*——幸存于压缩的语义信息——把名字改回来：

| 锚点 | 示例 | 结果 |
|---|---|---|
| 对象键 | `{ options: e, success: t, fail: n }` | `options` / `success` / `fail` |
| `this` 别名 | `var o = this` | `self` |
| 构造函数类型 | `new XMLHttpRequest()` | `xhr` |
| 成员赋值 | `self.playNoteAtNumber = n` | `function playNoteAtNumber(...)` |
| 调用点实参 | `foo(userList)` | 形参改为 `userList` |
| 被调用的参数 | `function (e) { e() }` | `callback` |
| Promise 执行器 | `new Promise(function (e) {...})` | `resolve` |

重命名是作用域安全的（命名冲突自动加数字后缀，如 `options1`），且只动压缩名，可读代码永不被改写。

### 解包工作流程

1. **检测**打包器类型（`webpack` / `browserify`）。
2. **定位**模块表：一个大型对象字面量，每个值是一个模块函数（webpack）或 `[fn, depMap]` 数组（browserify）。
3. **行为检测**每个模块函数参数的角色（作为 callee 被调用 → `require`、访问 `.exports` → `module`、...），而非假设位置——这同时适用于 `function(module, exports, require)`（webpack）与 `function(require, module, exports)`（browserify）。
4. **重写** `require()` 调用为相对路径（如 `require(3)` → `require('./3.cjs')`；browserify 依赖表键解析为真实模块名）。
5. **替换** webpack 运行时辅助函数引用（`require.d`、`require.r`、`require.n`、...）为对生成的 `WebpackHelper.cjs` 的调用。
6. **剥离**打包器包装，只保留模块体。
7. **分析**依赖图并**输出**每个模块为独立的 `.cjs` 文件，附带文档头（依赖、被引用方、未解析引用）。

## 项目结构

```
├── src/
│   ├── cli.ts                  # CLI：uncompress / unbundle / detect
│   ├── index.ts                # 公共导出
│   ├── uncompress.ts           # 解压缩管线（组件合并）
│   ├── base.ts                 # defineComponent 辅助
│   ├── components/             # AST 转换组件（17 个）
│   │   ├── anchor-propagation.ts
│   │   ├── constant-fold.ts
│   │   └── ...
│   ├── helper.ts               # webpack 运行时辅助代码生成
│   └── unbundler/
│       ├── index.ts            # detectBundle + unbundle 编排
│       ├── types.ts            # 共享类型
│       ├── roles.ts            # CJS 参数角色行为检测
│       ├── webpack.ts          # webpack 策略（定位 + 转换）
│       ├── browserify.ts       # browserify 策略
│       └── extractor.ts        # 图分析 + 内容生成
├── types/index.d.ts            # 类型声明
├── package.json
├── tsconfig.json
└── README.md
```

## 许可证

采用 **MIT** 许可证。

本项目仅用于学习和研究，请勿用于侵犯他人版权。

## 说明

- 解包输出可能包含未解析的引用或警告（`Tips`）；请始终检查生成的文件。
- 打包器版本和插件行为差异很大——某些模式可能无法完全还原。欢迎提交 issue 和 PR。

## 许可证

基于 **MIT** 许可证授权。

本项目仅用于学习和研究目的。请勿将其用于侵犯他人版权。

## 注意事项

- 解包后的输出可能包含未解决的引用或警告（`Tips`）；请始终检查生成的文件。
- webpack 版本和插件行为差异很大 — 某些模式可能无法完全还原。欢迎提交 Issue 和 Pull Request。
