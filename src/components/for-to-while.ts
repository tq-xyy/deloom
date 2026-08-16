import * as t from '@babel/types'
import { defineComponent } from '../base'

export default defineComponent({
    ForStatement(path) {
        const n = path.node
        const hasInit = !!n.init
        const hasTest = !!n.test
        const hasUpdate = !!n.update
        if (hasInit && !hasTest && !hasUpdate) {
            // for (var i = 0; ;) -> var i = 0; for (;;)
            const node = t.isVariableDeclaration(n.init)
                ? n.init
                : t.expressionStatement(n.init!)
            path.insertBefore(node)
            delete n.init
        }
        if (!hasInit && hasTest && !hasUpdate) {
            // for (; i < 10; ) -> while (i < 10)
            const node = t.whileStatement(n.test!, n.body)
            path.replaceWith(node)
        }
        if (!hasInit && !hasTest && !hasUpdate) {
            path.replaceWith(t.whileStatement(t.booleanLiteral(true), n.body))
        }
    },
})
