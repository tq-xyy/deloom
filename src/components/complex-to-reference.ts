import * as t from '@babel/types'
import { defineComponent } from '../base'

function checkObjectLevelMoreThan(obj: t.Node, level: number) {
    const queue: { node: t.Node; depth: number }[] = [{ node: obj, depth: 0 }]

    while (queue.length > 0) {
        const { node, depth } = queue.shift()!

        if (depth > level) return true

        if (node == null || typeof node !== 'object') continue

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
        const n = path.node
        if (
            t.isObjectExpression(n.object) &&
            n.object.properties.length > 10
        ) {
            let id = path.scope.generateUidIdentifier('staticObj')
            path.scope.push({ id, init: n.object })
            n.object = id
        }
    },
    CallExpression(path) {
        if (!path.parentPath.isExpressionStatement()) {
            return
        }
        path.node.arguments.forEach((arg, index) => {
            if (
                t.isExpression(arg) &&
                !t.isFunction(arg) &&
                checkObjectLevelMoreThan(arg, 9)
            ) {
                let id = path.scope.generateUidIdentifier('callArgs')
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
