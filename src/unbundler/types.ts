import type { NodePath } from '@babel/traverse'
import type * as t from '@babel/types'
import type { Helper } from './webpack-helper'

export type ModuleID = string & { __identifier_unused: null }

export type BundleType = 'webpack' | 'browserify' | 'unknown'

/** 文件无关的输入：文件名 + 内容 */
export interface BundleSource {
    filename: string
    content: string
}

/** 文件无关的输出：相对文件名 -> 内容 */
export interface UnbundleResult {
    type: BundleType
    files: Record<string, string>
    tips: string
}

export interface ModuleInfo {
    id: ModuleID
    /** Name that rewrited */
    name: string
    /** Original bundle filename */
    filename: string
    ast: t.Program
    dependcies: Set<ModuleID>
    referredBy?: Set<ModuleID>
}

export type ModuleGraph = Record<ModuleID, ModuleInfo>

export interface Tip {
    type:
        | 'require_ref'
        | 'require_as_arg'
        | 'wrong_member'
        | 'runtime_helper'
        | 'wrong_module_fn'
        | 'unexcepted_situation'
    module: ModuleID
    src: string
}

/** 模块转换上下文：收集提示与 helper，提供命名辅助 */
export interface TransformContext {
    tips: Tip[]
    helpers: Set<Helper>
    rewrite: (id: ModuleID) => string
}

export interface ModuleTransformResult {
    id: ModuleID
    ast: t.Program
    dependcies: Set<ModuleID>
}

/** 打包器策略：定位模块表 + 转换单个模块 */
export interface BundlerStrategy {
    type: BundleType
    locate(file: t.File): NodePath<t.ObjectExpression>
    transform(
        ctx: TransformContext,
        id: ModuleID,
        property: NodePath<t.ObjectProperty>
    ): ModuleTransformResult
}
