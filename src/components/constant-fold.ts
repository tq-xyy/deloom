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

        // not allow object & function

        if (
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            typeof value === 'string' ||
            typeof value === 'undefined' ||
            (typeof value === 'object' && value === null)
        ) {
            path.replaceWith(t.valueToNode(value))
        }
    } catch {
        // skip constify
    }
}

export default defineComponent({
    //  0x1f << 2 | 1 -> 124
    // 'a' + 'b' + 'c' -> 'abc'
    // !!0 -> false
    Binary(path) {
        tryConstify(path)
    },
    UnaryExpression(path) {
        tryConstify(path)
    },
})
