import * as t from '@babel/types'
import { defineComponent } from '../base'

export default defineComponent({
    BinaryExpression(path) {
        const n = path.node
        if (t.isPrivateName(n.left)) {
            return
        }

        // true === expr -> expr === true
        const leftIsLiteral =
            t.isIdentifier(n.left, { name: 'undefined' }) ||
            t.isLiteral(n.left) ||
            (t.isUnaryExpression(n.left) &&
                ['+', '-', '!', '~', 'void'].includes(n.left.operator) &&
                t.isLiteral(n.left.argument))
        const rightIsExpression =
            t.isIdentifier(n.right) || t.isExpression(n.right)

        const operatorIsEq = ['==', '===', '!==', '!='].includes(n.operator)
        const operatorIsCmp = ['>', '>=', '<', '<='].includes(n.operator)

        if (leftIsLiteral && rightIsExpression) {
            if (operatorIsEq) {
                const left = n.left
                n.left = n.right
                n.right = left
            } else if (operatorIsCmp) {
                const operatorMaps = {
                    '>': '<',
                    '<': '>',
                    '>=': '<=',
                    '<=': '>=',
                } as const

                n.operator =
                    operatorMaps[
                        n.operator as unknown as '<' | '>' | '>=' | '<='
                    ]

                const left = n.left
                n.left = n.right
                n.right = left
            }
        }
    },
})
