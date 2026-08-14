import { parse } from '@babel/parser'

import { browserifyStrategy } from './browserify'
import { Extractor } from './extractor'
import { webpackStrategy } from './webpack'
import type { BundleSource, BundleType, UnbundleResult } from './types'

export type { BundleType, BundleSource, UnbundleResult } from './types'
export type { ModuleInfo, Tip } from './types'

/**
 * 检测打包器类型（AST 级，与定位逻辑一致，避免正则误判）。
 * browserify 优先（其模块表是 [fn, depMap] 数组，与 webpack 的函数值互斥）。
 */
export function detectBundle(content: string): BundleType {
    let ast
    try {
        ast = parse(content)
    } catch {
        // 文件无法解析（可能本身是坏产物），视为无法检测
        return 'unknown'
    }
    try {
        browserifyStrategy.locate(ast)
        return 'browserify'
    } catch {
        /* not browserify */
    }
    try {
        webpackStrategy.locate(ast)
        return 'webpack'
    } catch {
        /* not webpack */
    }
    return 'unknown'
}

export interface UnbundleOptions {
    /** 文件无关的输入：文件名 + 内容 */
    sources: BundleSource[]
    log?: boolean
}

export async function unbundle(
    options: UnbundleOptions
): Promise<UnbundleResult> {
    const log = options.log ? console.log : () => {}

    if (options.sources.length === 0) {
        throw new Error('No sources provided')
    }

    // 多文件输入时（如目录扫描），跳过无法检测的文件，用第一个可检测类型
    let type: BundleType = 'unknown'
    for (const source of options.sources) {
        const detected = detectBundle(source.content)
        if (detected !== 'unknown') {
            type = detected
            break
        }
    }
    if (type === 'unknown') {
        throw new Error('Cannot detect the bundle type of the input files')
    }
    const strategy = type === 'webpack' ? webpackStrategy : browserifyStrategy
    const extractor = new Extractor(strategy)

    log('[1/3] Graph and Transform The Modules')
    const graph = await extractor.graph(options.sources)

    const nums_of_modules = Object.keys(graph).length
    log(
        `Found ${nums_of_modules} modules in ${options.sources.length} file(s).`
    )

    log('[2/3] Analyze The Modules')

    extractor.analyze(graph)

    log('[3/3] Emit The Modules and The Helper')

    const files: Record<string, string> = {}
    for (const module of Object.values(graph)) {
        const { filename, content } = await extractor.emit(module)
        files[filename] = content
    }
    const helper = await extractor.emitHelper()
    if (helper) {
        files[helper.filename] = helper.content
    }

    const tips = extractor.formatTips()
    log('Tips:\n' + tips)

    return { type, files, tips }
}
