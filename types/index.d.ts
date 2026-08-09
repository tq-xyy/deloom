import type * as t from '@babel/types'

interface Options {
    entries: string[]
    output: string
    log?: boolean
}

interface UncompressOptions {
    usePrettier?: boolean
    pref?: boolean
    throwErrors?: boolean
}

export function unbundle(options: Options): Promise<void>

export function formatSource(
    source: string | t.Program,
    options?: UncompressOptions
): Promise<string>
