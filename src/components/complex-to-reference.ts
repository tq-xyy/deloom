import * as t from '@babel/types'
import { defineComponent } from '../base'

export default defineComponent({
    MemberExpression(path) {
        const n = path.node
        if (
            t.isObjectExpression(n.object) &&
            n.object.properties.length > 10
        ) {
            let id = path.scope.generateUidIdentifier('staticObj')
            path.scope.push({ id, init: n.object })
            n.object = id
        }
    },
})
