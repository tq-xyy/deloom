import type { Visitor } from '@babel/traverse'
export type Component = Visitor

export function defineComponent(component: Component): Component {
    return component
}
