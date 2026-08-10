import * as t from '@babel/types'
import { defineComponent } from '../base'
import { identifierIsVaild } from './shared'

export default defineComponent({
    ClassMethod(path) {
        const n = path.node
        if (
            n.computed &&
            t.isStringLiteral(n.key) &&
            identifierIsVaild(n.key.value)
        ) {
            n.computed = false
            n.key = t.identifier(n.key.value)
        }
    },
    MemberExpression(path) {
        const n = path.node
        if (
            t.isStringLiteral(n.property) &&
            identifierIsVaild(n.property.value)
        ) {
            n.property = t.identifier(n.property.value)
            n.computed = false
        }
    },
    ObjectProperty(path) {
        // {['a']: 1} -> {a:1}
        const n = path.node
        if (
            t.isStringLiteral(n.key) &&
            identifierIsVaild(n.key.value) &&
            n.computed
        ) {
            n.key = t.identifier(n.key.value)
            n.computed = false
        }

        // {a: function(){}} -> {a() {}}
        if (
            t.isFunctionExpression(n.value) &&
            !n.value.id &&
            !t.isPrivateName(n.key)
        ) {
            path.replaceWith(
                t.objectMethod(
                    'method',
                    n.key,
                    n.value.params,
                    n.value.body,
                    n.computed,
                    n.value.generator,
                    n.value.async
                )
            )
        }
    },
})
