import * as t from '@babel/types'
import { defineComponent } from '../base'

export default defineComponent({
    ExpressionStatement(path) {
        const n = path.node
        const isLiteral = [
            'NumericLiteral',
            'BooleanLiteral',
            'NullLiteral',
            'StringLiteral',
            'RegExpLiteral',
        ].includes(n.expression.type)

        const isUndefined = t.isIdentifier(n.expression, {
            name: 'undefined',
        })

        // !0、void 0、-1 等折叠残留（constantFold 折叠前是无副作用的 UnaryExpression）
        const isFoldableUnary =
            t.isUnaryExpression(n.expression) &&
            ['!', '+', '-', '~', 'void'].includes(n.expression.operator) &&
            t.isLiteral(n.expression.argument)

        if (isLiteral || isUndefined || isFoldableUnary) {
            path.remove()
        }
    },
})
