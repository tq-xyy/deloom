# deloom

[English](./README.md)/中文

**deloom** 是一个用于**解压缩**和**解包**由打包工具和压缩工具（如 **webpack**、**terser** 等）生成的 JavaScript 文件的工具。通过 Babel AST 转换，它将混淆或压缩的代码恢复为更易读的形式，并将 webpack 打包文件拆解为独立的 CommonJS 模块。

## 特性

- **解压缩** — 解压缩并美化单个被压缩的 JavaScript 文件：格式化代码、常量折叠、删除死代码、展开条件表达式等。
- **解包** — 将一个或多个 webpack 打包文件（例如 `1.js`、`2.js`）中的模块图提取为独立的 `.cjs` 文件，以及所需的 webpack 运行时辅助代码。
- 基于 Babel 解析器和遍历，支持现代 ECMAScript 语法。
- 提供 CLI 和编程式 API。

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
--throw-errors     转换过程中抛出错误（默认：捕获错误并回退）
--no-timing        禁用性能计时输出
```

### 2. 解包 webpack 打包文件

```bash
deloom unbundle ./dist/chunks ./output
```

其中 `./dist/chunks` 是一个包含一个或多个打包文件（如 `1.js`、`2.js`）的目录，`./output` 是输出目录。该工具会解析所有匹配的文件，提取模块定义，并生成独立的 `.cjs` 文件以及一个 `WebpackHelper.cjs` 辅助模块。

选项：

```
--filter <pattern>  文件过滤模式，默认为 `*.js`
--no-log            禁用控制台日志输出
--no-clean          运行前不清空输出目录
```

## API 用法

该包暴露了两个主要函数：

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

### `unbundle(options)`

解包 webpack 打包文件。

```ts
import { unbundle } from 'deloom'

await unbundle({
  entries: ['./dist/chunks/1.js', './dist/chunks/2.js'],
  output: './output',
  log: true,
})
```

## 工作原理

### 解压缩转换

按顺序应用一系列 Babel 访问器：

- 规范化字符串/数值字面量表示
- 常量折叠（`1 + 2 * 3` → `7`）
- 对象属性简写（`{a: a}` → `{a}`）
- 函数表达式转为箭头函数（`function(){}` → `() => {}`）
- 三元表达式转为 if/else（`cond ? a() : b()` → `if/else`）
- 逻辑表达式转为 if（`a && b()` → `if (a) { b() }`）
- Promise 执行器参数重命名（`(a, b)` → `(resolve, reject)`）
- try-catch 参数重命名（`e` → `caughtError`）
- `void 0` → `undefined`
- 序列表达式拆分（`(a(), b())` → `a(); b()`）
- 从表达式中提取赋值语句
- 以及更多……

### 解包工作流程

1. **解析**每个打包文件，定位主模块对象（一个大的 `ObjectExpression`，其中每个属性都是一个模块函数）。
2. **遍历**每个模块函数，识别 `require()` 调用和 webpack 运行时辅助函数（`require.d`、`require.r`、`require.n` 等）。
3. **重写**模块的数字 ID 为相对路径（例如 `require(3)` → `require('./3.cjs')`）。
4. **替换**对 webpack 运行时辅助函数的引用，改为调用 `WebpackHelper.cjs`。
5. **剥离** webpack 包装器，只保留模块体。
6. **分析**依赖关系图。
7. **输出**每个模块为独立的 `.cjs` 文件，并附带文档头，同时生成 `WebpackHelper.cjs`。

## 项目结构

```
├── bin/
│   └── cli.ts               # CLI 入口点
├── src/
│   ├── index.ts             # 导出 formatSource 和 unbundle
│   ├── uncompress.ts        # 解压缩核心逻辑（AST 转换）
│   ├── unbundler.ts         # 解包核心（Extractor 类）
│   ├── helper.ts            # webpack 运行时辅助代码生成
│   └── deps.d.ts            # 类型声明
├── package.json
├── tsconfig.json
├── .prettierrc.json
└── README.md
```

## 许可证

基于 **MIT** 许可证授权。

本项目仅用于学习和研究目的。请勿将其用于侵犯他人版权。

## 注意事项

- 解包后的输出可能包含未解决的引用或警告（`Tips`）；请始终检查生成的文件。
- webpack 版本和插件行为差异很大 — 某些模式可能无法完全还原。欢迎提交 Issue 和 Pull Request。
