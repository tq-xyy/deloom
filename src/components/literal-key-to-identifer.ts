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
            path.replaceWith(
                t.classMethod(
                    n.kind,
                    t.identifier(n.key.value),
                    n.params,
                    n.body,
                    n.computed,
                    n.static,
                    n.generator,
                    n.async
                )
            )
        }
    },
    MemberExpression(path) {
        const n = path.node
        if (
            n.computed &&
            t.isStringLiteral(n.property) &&
            identifierIsVaild(n.property.value)
        ) {
            path.replaceWith(
                t.memberExpression(
                    n.object,
                    t.identifier(n.property.value),
                    false
                )
            )
        }
    },
    ObjectProperty(path) {
        // {['a']: 1} -> {a:1}
        const n = path.node
        if (
            n.computed &&
            t.isStringLiteral(n.key) &&
            identifierIsVaild(n.key.value)
        ) {
            path.replaceWith(
                t.objectProperty(t.identifier(n.key.value), n.value, false)
            )
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
