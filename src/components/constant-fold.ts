import generate from '@babel/generator'
import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { defineComponent } from '../base'

function tryConstify(path: NodePath<t.Expression>) {
    function canConstantify(node: t.Node) {
        if (node.type === 'NumericLiteral') {
            return true
        }
        if (node.type === 'StringLiteral') {
            return true
        }

        if (node.type === 'ArrayExpression' && node.elements.length === 0) {
            return true
        }
        if (
            node.type === 'UnaryExpression' &&
            ['void', '!', '+', '-', '~'].includes(node.operator) &&
            canConstantify(node.argument)
        ) {
            return true
        }

        if (
            node.type === 'BinaryExpression' &&
            [
                '+',
                '-',
                '*',
                '/',
                '%',
                '*',
                '**',
                '&',
                '|',
                '>>',
                '>>>',
                '<<',
                '^',
            ].includes(node.operator) &&
            canConstantify(node.left) &&
            canConstantify(node.right)
        ) {
            return true
        }
        return false
    }

    if (!canConstantify(path.node)) {
        return
    }
    try {
        const value = new Function(
            generate(t.returnStatement(path.node)).code
        )()

        // NaN/Infinity 不折叠：valueToNode 会生成 0/0、1/0 等退化输出（如 1e999 -> 1/0）
        if (typeof value === 'number' && !Number.isFinite(value)) {
            return
        }

        // 仅折叠基础类型
        if (
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            typeof value === 'string' ||
            typeof value === 'undefined'
        ) {
            const newNode = t.valueToNode(value)
            // 防止无限循环：-1 折叠后仍是 UnaryExpression(-1)，
            // 若新旧节点等价则跳过（否则 replaceWith 触发 requeue 死循环）
            if (t.isNodesEquivalent(path.node, newNode)) {
                return
            }
            path.replaceWith(newNode)
        }
    } catch {
        // 求值失败则跳过
    }
}

export default defineComponent({
    // 0x1f << 2 | 1 -> 125
    // 'a' + 'b' + 'c' -> 'abc'
    // !!0 -> false
    Binary(path) {
        tryConstify(path)
    },
    UnaryExpression(path) {
        tryConstify(path)
    },
})
