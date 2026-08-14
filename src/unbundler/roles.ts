import type { Scope } from '@babel/traverse'
import * as t from '@babel/types'

export interface CjsRoles {
    require?: string
    module?: string
    exports?: string
}

/**
 * 行为检测 CJS 模块函数参数角色，替代"第 N 个参数就是某角色"的位置假设：
 * - 被调用为 callee（含 .call/.apply）-> require
 * - 访问了 .exports / .id / .hot 成员 -> module
 * - 其余有引用的参数中第一个 -> exports
 *
 * webpack: function(module, exports, require)
 * browserify: function(require, module, exports)
 * 两种顺序都能正确识别。
 */
export function detectCjsRoles(fnNode: t.Function, scope: Scope): CjsRoles {
    const roles: CjsRoles = {}
    const exportsCandidates: string[] = []

    for (const param of fnNode.params) {
        if (!t.isIdentifier(param)) continue
        const binding = scope.getBinding(param.name)
        if (!binding || binding.referencePaths.length === 0) continue

        // require: 被调用
        const isRequire = binding.referencePaths.some(ref => {
            const parent = ref.parentPath
            if (!parent || !parent.isCallExpression()) return false
            if (parent.node.callee === ref.node) return true
            // x.call(...) / x.apply(...)
            const callee = parent.node.callee
            return (
                t.isMemberExpression(callee) &&
                !callee.computed &&
                callee.object === ref.node &&
                t.isIdentifier(callee.property) &&
                (callee.property.name === 'call' ||
                    callee.property.name === 'apply')
            )
        })
        if (isRequire) {
            roles.require = param.name
            continue
        }

        // module: 访问 .exports / .id / .hot 成员
        const isModule = binding.referencePaths.some(ref => {
            const parent = ref.parentPath
            if (!parent || !parent.isMemberExpression()) return false
            if (parent.node.object !== ref.node) return false
            return (
                t.isIdentifier(parent.node.property, { name: 'exports' }) ||
                t.isIdentifier(parent.node.property, { name: 'id' }) ||
                t.isIdentifier(parent.node.property, { name: 'hot' })
            )
        })
        if (isModule) {
            roles.module = param.name
            continue
        }

        exportsCandidates.push(param.name)
    }

    if (!roles.exports && exportsCandidates.length > 0) {
        roles.exports = exportsCandidates[0]
    }
    return roles
}
