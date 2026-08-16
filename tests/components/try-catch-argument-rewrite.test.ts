import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import tryCatchArgumentRewrite from '../../src/components/try-catch-argument-rewrite'
import { transform } from '../helpers'

describe('try-catch-argument-rewrite', () => {
    test('catch param -> caughtError', () => {
        assert.equal(
            transform(`try { } catch (e) { }`, tryCatchArgumentRewrite),
            `try {} catch (caughtError) {}`
        )
    })

    test('destructured param untouched', () => {
        assert.equal(
            transform(
                `try { } catch ({ message }) { }`,
                tryCatchArgumentRewrite
            ),
            `try {} catch ({\n  message\n}) {}`
        )
        assert.equal(
            transform(`try { } catch ([a]) { }`, tryCatchArgumentRewrite),
            `try {} catch ([a]) {}`
        )
    })

    test('catch without param untouched', () => {
        assert.equal(
            transform(`try { } catch { }`, tryCatchArgumentRewrite),
            `try {} catch {}`
        )
    })

    test('name taken -> suffix appended', () => {
        assert.equal(
            transform(
                `var caughtError; try { } catch (e) { }`,
                tryCatchArgumentRewrite
            ),
            `var caughtError;\ntry {} catch (caughtError1) {}`
        )
    })
})
