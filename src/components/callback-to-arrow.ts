import * as t from '@babel/types'
import { defineComponent } from '../base'

export default defineComponent({
    FunctionExpression(path) {
        const n = path.node
        if (
            (t.isCallExpression(path.parent) ||
                t.isReturnStatement(path.parent)) &&
            !n.generator &&
            !n.id
        ) {
            let hasThis = false
            path.traverse({
                ThisExpression() {
                    hasThis = true
                },
                Identifier(path) {
                    if (path.node.name === 'arguments') {
                        hasThis = true
                    }
                },
            })
            if (!hasThis) {
                const arrow = t.arrowFunctionExpression(
                    n.params,
                    n.body,
                    n.async
                )
                path.replaceWith(arrow)
            }
        }
    },
})
