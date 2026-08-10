import * as t from '@babel/types'
import { defineComponent } from '../base'

export default defineComponent({
    ForStatement(path) {
        const n = path.node
        const hasInit = !!n.init
        const hasTest = !!n.test
        const hasUpdate = !!n.update
        if (hasInit && !hasTest && !hasUpdate) {
            const node = t.isVariableDeclaration(n.init)
                ? n.init
                : t.expressionStatement(n.init!)
            path.insertBefore(node)
            delete n.init
        }
        if (!hasInit && hasTest && !hasUpdate) {
            const node = t.whileStatement(
                n.test || t.booleanLiteral(true),
                n.body
            )
            path.replaceWith(node)
        }
    },
})
