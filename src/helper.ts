export const WEBPACK_HELPER_ID = 'WebpackHelper'

const PATCH_D = `
// define getter functions for harmony exports
exports.requireD = function requireD(exports, definition) {
    for (var key in definition) {
        if (
            Object.prototype.hasOwnProperty.call(definition, key) &&
            !Object.prototype.hasOwnProperty.call(exports, key)
        ) {
            Object.defineProperty(exports, key, {
                enumerable: true,
                get: definition[key],
            })
        }
    }
}
`
const PATCH_N = `
// getDefaultExport function for compatibility with non-harmony modules
exports.requireN = function requireN(module) {
    var getter =
        module && module.__esModule ? () => module['default'] : () => module
    Object.defineProperty(getter, 'a', {
        enumerable: true,
        get: getter,
    })
    return getter
}
`
const PATCH_R = `
// define __esModule on exports
exports.requireR = function requireR(exports) {
    if (typeof Symbol !== 'undefined' && Symbol.toStringTag) {
        Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    }
    Object.defineProperty(exports, '__esModule', { value: true })
}
`
const PATCH_HMD = `
// harmony module decorator
exports.requireHMD = function requireHMD(module) {
    module = Object.create(module)
    if (!module.children) {
        module.children = []
    }
    Object.defineProperty(module, 'exports', {
        enumerable: true,
        set: () => {
            throw new Error(
                'ES Modules may not assign module.exports or exports.*, Use ESM export syntax, instead: ' +
                    module.id
            )
        },
    })
    return module
}
`

const PATCH_NMD = `
// node module decorator
exports.requireNMD = function requireNMD(module) {
    module.paths = []
    if (!module.children) {
        module.children = []
    }
    return module
}
`

const HELPERS = {
    d: PATCH_D,
    r: PATCH_R,
    n: PATCH_N,
    hmd: PATCH_HMD,
    nmd: PATCH_NMD,
}

export type Helper = keyof typeof HELPERS

export function isHelper(name: string): name is Helper {
    return name in HELPERS
}

const BANNER = `\
/*
 * This code is part of the webpack source code,
 * which is open source under the MIT license.
 * MIT License http://www.opensource.org/licenses/mit-license.php
 */
`

export function concatHelper(helpers: Set<Helper>): string {
    if (helpers.size === 0) {
        return ''
    }

    let code = BANNER

    for (const helper of helpers) {
        if (isHelper(helper)) {
            code += HELPERS[helper]
        }
    }

    return code
}
