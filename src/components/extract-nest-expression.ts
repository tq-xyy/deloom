import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { defineComponent } from '../base'

export default defineComponent({
    SequenceExpression(path) {
        const n = path.node

        // (0, a)() -> a()
        if (
            n.expressions.length === 2 &&
            t.isNumericLiteral(n.expressions[0], { value: 0 })
        ) {
            path.replaceWith(n.expressions[1])
            return
        }

        // a, b -> a; b
        if (t.isExpressionStatement(path.parent)) {
            const exprs = n.expressions.map(expr =>
                t.expressionStatement(expr)
            )
            path.parentPath.replaceWithMultiple(exprs)
            return
        }

        // return a, b -> a; return b（throw 同理）
        if (
            t.isReturnStatement(path.parent) ||
            t.isThrowStatement(path.parent)
        ) {
            const lastone = n.expressions.pop()!
            for (const expr of n.expressions) {
                path.parentPath.insertBefore(t.expressionStatement(expr))
            }
            path.replaceWith(lastone)
            return
        }

        // if (a, b) {...} -> a; if (b) {...}
        if (t.isIfStatement(path.parent) && path.parentKey === 'test') {
            const lastone = n.expressions.pop()!
            for (const expr of n.expressions) {
                path.parentPath.insertBefore(t.expressionStatement(expr))
            }
            path.replaceWith(lastone)
            return
        }

        // var x = (a, b) -> a; var x = b
        if (
            t.isVariableDeclarator(path.parent) &&
            path.parentKey === 'init' &&
            path.parentPath.parentPath!.isVariableDeclaration()
        ) {
            const lastone = n.expressions.pop()!
            for (const expr of n.expressions) {
                path.parentPath.parentPath.insertBefore(
                    t.expressionStatement(expr)
                )
            }
            path.replaceWith(lastone)
            return
        }

        // fn((a, b)) -> a; fn(b)（父为语句时才能提出）
        if (
            t.isCallExpression(path.parent) &&
            path.parentKey === 'arguments'
        ) {
            const statementBlock = path.parentPath.parentPath!

            if (statementBlock.isStatement()) {
                const lastone = n.expressions.pop()!
                for (const expr of n.expressions) {
                    statementBlock.insertBefore(t.expressionStatement(expr))
                }
                path.replaceWith(lastone)
            }
        }
    },
    AssignmentExpression(path) {
        const n = path.node
        // 解构赋值不动（[a] = b、({a} = b)）
        if (t.isPattern(n.left)) {
            return
        }

        if (n.operator === '=') {
            let current: NodePath<t.Node> = path

            // 合法 AST 中赋值表达式恒有语句祖先
            while (!current.parentPath!.isStatement()) {
                current = current.parentPath!
            }

            // if (x = f()) {...} -> x = f(); if (x) {...}
            if (
                current.parentPath!.isIfStatement() &&
                current.parentKey === 'test'
            ) {
                current.parentPath.insertBefore(t.expressionStatement(n))
                path.replaceWith(n.left)
            }
            // return x = f() -> x = f(); return x
            if (
                current.parentPath!.isReturnStatement({
                    argument: n,
                }) &&
                current.parentKey === 'argument'
            ) {
                current.parentPath.insertBefore(t.expressionStatement(n))
                path.replaceWith(n.left)
            }
            // var y = (x = f()) -> x = f(); var y = x
            if (current.parentPath!.isVariableDeclaration()) {
                current.parentPath.insertBefore(t.expressionStatement(n))
                path.replaceWith(n.left)
            }
        }
        if (['+=', '-='].includes(n.operator)) {
            // a += b += c -> b += c; a += b
            const root = path.findParent(path => path.isStatement())!

            let chains: t.AssignmentExpression[] = [],
                curr = n
            while (
                t.isAssignmentExpression(curr) &&
                t.isAssignmentExpression(curr.right)
            ) {
                if (!t.isExpression(curr.right.left)) {
                    return
                }
                let temp = curr.right
                curr.right = curr.right.left
                curr = temp
                chains.unshift(curr)
            }
            for (const node of chains) {
                root.insertBefore(t.expressionStatement(node))
            }
        }
    },
    LogicalExpression: {
        // 用 exit：left 可能是 AssignmentExpression（如 (n = e(x)) && n.b），
        // 需等 AssignmentExpression visitor 提取为语句后结构才定型，一轮收敛
        exit(path) {
            // a && a.b -> a?.b
            if (
                path.node.operator === '&&' &&
                t.isIdentifier(path.node.left) &&
                t.isMemberExpression(path.node.right) &&
                t.isIdentifier(path.node.right.object, {
                    name: path.node.left.name,
                }) &&
                t.isIdentifier(path.node.right.property) &&
                path.node.right.computed === false
            ) {
                const obj = path.node.left
                const prop = path.node.right.property
                path.replaceWith(
                    t.optionalMemberExpression(obj, prop, false, true)
                )
            }
        },
    },
})
