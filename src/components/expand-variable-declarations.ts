import { defineComponent } from '../base'
import * as t from '@babel/types'

export default defineComponent({
    VariableDeclaration(path) {
        // var a = 1, b = 2, c = 3 -> let a = 1; let b = 2; let c = 3
        const n = path.node
        if (t.isFor(path.parent)) {
            return
        }

        const kind = n.kind === 'var' ? 'let' : n.kind

        if (
            ['var', 'const', 'let'].includes(n.kind) &&
            n.declarations.length > 1 &&
            n.declarations.filter(dec => !!dec.init).length > 0
        ) {
            const declarations = n.declarations.map(dec =>
                t.variableDeclaration(kind, [dec])
            )
            path.replaceWithMultiple(declarations)
        }

        if (n.declarations.length === 1) {
            if (kind !== n.kind) {
                n.kind = kind
            }
        }
    },
})
