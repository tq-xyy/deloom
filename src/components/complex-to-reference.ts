import * as t from '@babel/types'
import { defineComponent } from '../base'

// 导出以便单测直接覆盖各深度分支（level 参数可变）
export function checkObjectLevelMoreThan(obj: t.Node, level: number) {
    const queue: { node: t.Node; depth: number }[] = [{ node: obj, depth: 0 }]

    while (queue.length > 0) {
        const item = queue.shift()
        if (!item) break
        const { node, depth } = item

        if (depth > level) return true

        const children = Array.isArray(node) ? node : Object.values(node)

        for (const child of children) {
            if (child != null && typeof child === 'object') {
                if (depth === level) {
                    return true
                }
                queue.push({ node: child, depth: depth + 1 })
            }
        }
    }

    return false
}

export default defineComponent({
    MemberExpression(path) {
        // ({...11 个属性}).x -> var _staticObj = {...}; _staticObj.x
        const n = path.node
        if (
            t.isObjectExpression(n.object) &&
            n.object.properties.length > 10
        ) {
            const id = path.scope.generateUidIdentifier('staticObj')
            path.scope.push({ id, init: n.object })
            n.object = id
        }
    },
    CallExpression(path) {
        // fn(深嵌套对象) -> var _callArgs = {...}; fn(_callArgs)
        if (!path.parentPath.isExpressionStatement()) {
            return
        }
        path.node.arguments.forEach((arg, index) => {
            if (
                t.isExpression(arg) &&
                !t.isFunction(arg) &&
                checkObjectLevelMoreThan(arg, 9)
            ) {
                const id = path.scope.generateUidIdentifier('callArgs')
                path.node.arguments[index] = id
                path.parentPath.insertBefore(
                    t.variableDeclaration('const', [
                        t.variableDeclarator(id, arg),
                    ])
                )
            }
        })
    },
})
