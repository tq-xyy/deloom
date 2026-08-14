---
name: deloom
description: '逆向 JavaScript 文件时的标准前置流程：先用 deloom CLI 解压/解包压缩、混淆或 webpack/browserify 打包的 JS，再在其输出上阅读与修改。Use when: 用户要求逆向、反混淆、解压、解包 JS；理解压缩/混淆代码；修改 hack 某个 webpack/browserify 打包文件、单行压缩 JS；分析 terser/webpack/browserify 产物。'
user-invocable: true
---

# JS 逆向前置解压/解包流程

## 作用

在阅读或修改任何压缩、混淆、webpack/browserify 打包的 JS 文件之前，**先运行 deloom 将其还原为易读形式**，再在还原后的文件上分析和编写 hack 代码，避免直接面对单行压缩代码或在压缩代码上改语法导致反复出错。

## 何时使用

- 用户要求逆向 / 反混淆 / 解压 / 解包某个 JS 文件
- 需要理解一个压缩或混淆的 JS 文件（单行、变量名 `a/b/c`、terser 产物）
- 需要修改 / hack 一个 webpack 打包产物（`1.js`、`chunk-vendors.*.js` 等）或 browserify 产物（`[模块函数, 依赖表]` 结构）
- 目标是：降低理解成本，且 hack 代码不因原文件语法问题而频繁报错

## 前置条件

确保 CLI 可用（项目内使用）：

```bash
pnpm build
```

## 决策分支：判断输入类型

**先跑 `deloom detect <file>` 自动判断**，输出 `webpack` / `browserify` / `unknown`，再按下表处理：

| detect 结果 / 输入特征                                                                               | 处理方式        |
| ---------------------------------------------------------------------------------------------------- | --------------- |
| `unknown`：单个压缩/混淆的 JS 文件（无模块包装结构）                                                  | `uncompress`    |
| `webpack`：含 `__webpack_require__`、`webpackJsonp`、数字模块 ID、`require.d/r/n` 运行时辅助函数      | `unbundle`      |
| `browserify`：模块表属性值为 `[function, {依赖映射}]` 数组，函数形如 `function(require, module, exports)` | `unbundle`      |
| `unknown` 但结果中仍有大量模块包装结构                                                                | 改用 `unbundle` |

## 工作流

### A. 单文件解压

```bash
deloom uncompress input.js output.js
```

可选参数：

- `--no-prettier` — 禁用 Prettier 二次格式化（默认开启，通常保留）
- `--no-pref` — 禁用文件头部说明注释
- `--throw-errors` — 转换出错时抛错（默认捕获错误并回退，排查转换 bug 时用）
- `--no-timing` — 关闭耗时统计输出

**不要**在 `input.js` 上原地修改。输出写入 `output.js` 后，所有后续分析/修改都基于 `output.js`。

### B. 打包文件解包

```bash
deloom detect ./chunks/1.js          # 先确认类型（webpack / browserify）
deloom unbundle ./chunks ./output
```

- `./chunks`：包含一个或多个打包文件的目录（`--filter <pattern>` 控制匹配，默认 `*.js`）
- `./output`：输出目录，默认会先清空（`--no-clean` 可关闭）
- 工具自动检测打包器类型（webpack / browserify），类型不匹配或无法解析的文件自动跳过
- 产物：每个模块一个 `.cjs` 文件；webpack 额外生成 `WebpackHelper.cjs` 运行时辅助模块

解包后的模块间依赖已重写为相对路径 `require('./3.cjs')`（browserify 的依赖表已解析为真实模块名），直接阅读每个模块即可，无需关心数字 ID 映射。

### C. 验证输出

解压/解包完成后，先验证语法与可读性，再开始修改：

```bash
node --check output.js            # 单文件语法校验
node --check output/123.cjs       # 抽查解包模块
```

- 输出文件应可读、可搜索（变量名展开、缩进正常）
- 解包输出中若有 `Tips` 警告注释，说明存在未完全解析的引用，修改前先定位这些位置
- 若转换报错或输出仍不可读，带上 `--throw-errors` 重跑并收集错误信息

## 质量检查清单

- [ ] 已用 `detect` 确认输入类型（单文件 vs webpack vs browserify）并选用正确命令
- [ ] 输出文件语法通过 `node --check`
- [ ] 输出文件可读：变量名完整（含锚点传播后的语义化名称）、缩进正常、无残留单行大段代码
- [ ] hack 修改均在输出文件上进行，原始文件未被改动
- [ ] 解包场景下检查过 `Tips` 警告与未解决引用

## 注意事项

- 解包结果可能与原始行为存在差异（webpack/browserify 版本/插件差异），修改前先理解依赖关系
- 本项目仅用于学习和研究，请勿用于侵犯他人版权
