import { defineComponent } from '../base'
import { renameToDesired } from './shared'

export default defineComponent({
    CatchClause(path) {
        const subpath = path.get('param')
        if (!subpath.isIdentifier()) return
        renameToDesired(subpath.scope, subpath.node.name, 'caughtError')
    },
})
