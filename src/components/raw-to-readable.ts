import { defineComponent } from '../base'

export default defineComponent({
    StringLiteral(path) {
        const n = path.node
        if (!n.extra) {
            n.extra = {
                rawValue: n.value,
            }
        }
        if ((n.extra.rawValue as string).includes('\\x')) {
            return
        }
        n.extra.raw = JSON.stringify(n.extra.rawValue)
    },
    NumericLiteral(path) {
        const n = path.node
        if (!n.extra) {
            n.extra = {
                rawValue: n.value,
            }
        }
        n.extra.raw = n.value.toString()
    },
})
