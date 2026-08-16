import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'

export default defineConfig(
    eslint.configs.recommended,
    tseslint.configs.strict,
    prettierConfig
)
