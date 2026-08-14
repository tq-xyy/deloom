import type * as t from '@babel/types'

type BundleType = 'webpack' | 'browserify' | 'unknown'

interface BundleSource {
    filename: string
    content: string
}

interface UnbundleResult {
    type: BundleType
    files: Record<string, string>
    tips: string
}

interface UnbundleOptions {
    sources: BundleSource[]
    log?: boolean
}

interface UncompressOptions {
    usePrettier?: boolean
    pref?: boolean
    throwErrors?: boolean
}

export function unbundle(options: UnbundleOptions): Promise<UnbundleResult>

export function detectBundle(content: string): BundleType

export function formatSource(
    source: string | t.Program,
    options?: UncompressOptions
): Promise<string>
