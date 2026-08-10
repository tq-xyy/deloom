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

        if (isLiteral || isUndefined) {
            path.remove()
        }
    },
})
