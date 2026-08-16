import { transform as esbuildTransform } from 'esbuild'

/**
 * unbundler 测试样本工厂：不装 webpack，手写/程序化生成 bundle 文本。
 * 模块表格式（{id: function} / {id: [fn, depMap]}）是公开稳定的文本格式，
 * 用 esbuild（已有 devDep）minify 模块体来模拟真实压缩产物的形态。
 */

/** 用 esbuild minify 一段代码（模拟 terser 压缩后的模块体） */
export async function minify(code: string): Promise<string> {
    const { code: out } = await esbuildTransform(code, { minify: true })
    return out
}

/**
 * 生成 webpack bundle 文本。
 * 模块数 >= 100 时模块表占比 > 95%（locate 的硬性门槛，与真实 bundle 一致：
 * runtime 固定几百字节，模块表随模块数增长）。
 */
export async function buildWebpackBundle(
    modules: Record<string, string>,
    options: { runtime?: string } = {}
): Promise<string> {
    const entries: string[] = []
    for (const [id, source] of Object.entries(modules)) {
        const body = await minify(source)
        entries.push(
            `"${id}": function (module, exports, require) { ${body} }`
        )
    }
    const runtime =
        options.runtime ??
        `;var r={};function o(t){var n=r[t];if(void 0!==n)return n.exports;var s=r[t]={exports:{}};return e[t](s,s.exports,o),s.exports}o.d=(e,r)=>{for(var t in r)o.o(r,t)&&!o.o(e,t)&&Object.defineProperty(e,t,{enumerable:!0,get:r[t]})},o.o=(e,r)=>Object.prototype.hasOwnProperty.call(e,r),o.r=e=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},(()=>{o.r(o);var t=o(1)})()})();`
    return `(() => {
  var e = ({
    ${entries.join(',\n    ')}
  });
${runtime}`
}

/** 程序化生成 N 个链式依赖的小模块（模拟真实 bundle 的模块表主导占比） */
export function genChainModules(
    count: number,
    startId = 1
): Record<string, string> {
    const modules: Record<string, string> = {}
    for (let i = startId; i < startId + count; i++) {
        const dep = i > startId ? `var d = require(${i - 1});` : ''
        modules[String(i)] = `
            ${dep}
            var value = ${i} * 2;
            exports.result = value + (d ? d.result : 0);
        `
    }
    return modules
}

/** browserify 版本：模块返回 [源码, 依赖表]，require 用局部名 */
export function genBrowserifyModules(
    count: number,
    startId = 1
): Record<string, [string, Record<string, string>?]> {
    const modules: Record<string, [string, Record<string, string>?]> = {}
    for (let i = startId; i < startId + count; i++) {
        const dep = i > startId ? `var d = require("./mod${i - 1}");` : ''
        modules[String(i)] = [
            `
            ${dep}
            var value = ${i} * 2;
            exports.result = value + (d ? d.result : 0);
            `,
            i > startId ? { [`./mod${i - 1}`]: String(i - 1) } : undefined,
        ]
    }
    return modules
}

/**
 * 生成 browserify bundle 文本。
 * 格式：{id: [function(require, module, exports){...}, {依赖名: 模块id}]}
 */
export async function buildBrowserifyBundle(
    modules: Record<string, [string, Record<string, string>?]>
): Promise<string> {
    const entries: string[] = []
    for (const [id, [source, depMap]] of Object.entries(modules)) {
        const body = await minify(source)
        const deps = depMap ? `, ${JSON.stringify(depMap)}` : ''
        entries.push(
            `"${id}": [function (require, module, exports) { ${body} }${deps}]`
        )
    }
    return `(function () {
  var modules = ({
    ${entries.join(',\n    ')}
  });
  var cache = {};
  function require(id) {
    if (cache[id]) return cache[id].exports;
    var fn = modules[id][0];
    var module = (cache[id] = { exports: {} });
    var depMap = modules[id][1] || {};
    var localRequire = function (name) {
      return require(depMap[name]);
    };
    fn(localRequire, module, module.exports);
    return module.exports;
  }
  require(1);
})();`
}
