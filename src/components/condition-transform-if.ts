import * as t from '@babel/types'
import { defineComponent } from '../base'

export default defineComponent({
    ConditionalExpression(path) {
        const n = path.node

        // cond ? a() : b() -> if (cond) { a() } else { b() }
        if (path.parentPath.isExpressionStatement()) {
            const left = t.blockStatement([
                t.expressionStatement(n.consequent),
            ])
            const right = t.isConditionalExpression(n.alternate)
                ? t.expressionStatement(n.alternate)
                : t.blockStatement([t.expressionStatement(n.alternate)])
            path.parentPath.replaceWith(t.ifStatement(n.test, left, right))
        }
        // return cond ? a : b -> if (cond) { return a } else { return b }
        if (t.isReturnStatement(path.parent)) {
            const left = t.blockStatement([t.returnStatement(n.consequent)])
            const right = t.isConditionalExpression(n.alternate)
                ? t.returnStatement(n.alternate)
                : t.blockStatement([t.returnStatement(n.alternate)])
            path.parentPath.replaceWith(t.ifStatement(n.test, left, right))
        }
    },
    LogicalExpression(path) {
        const n = path.node

        if (
            t.isExpressionStatement(path.parent) &&
            !t.isLogicalExpression(n.right)
        ) {
            // a && b() -> if (a) { b() }
            if (n.operator === '&&') {
                const test = n.left
                const body = t.blockStatement([t.expressionStatement(n.right)])
                path.parentPath.replaceWith(t.ifStatement(test, body))
            }
            // a || b() -> if (!a) { b() }
            if (n.operator === '||') {
                const test = t.unaryExpression('!', n.left)
                const body = t.blockStatement([t.expressionStatement(n.right)])
                path.parentPath.replaceWith(t.ifStatement(test, body))
            }
        }
    },
})
