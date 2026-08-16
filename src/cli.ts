import { readFile, writeFile, unlink, rm, mkdir, glob } from 'fs/promises'
import * as path from 'path'

import { Command } from 'commander'

import { formatSource } from './uncompress'
import { detectBundle, unbundle } from './unbundler/index'
import type { BundleSource } from './unbundler'

import packageJson from '../package.json'

function guessOutput(input: string) {
    if (input.endsWith('.js')) {
        return input.replace(/\.js$/, '.out.js')
    }
    return input + '.out'
}

const program = new Command()

program
    .name(packageJson.name)
    .description(packageJson.description)
    .version(packageJson.version)

program
    .command('uncompress')
    .description('Uncompress a js file')
    .argument('<input>', 'input file path')
    .argument('[output]', 'output file path')
    .option('--no-prettier', 'disable prettier formatting')
    .option('--no-pref', 'disable prefix adding')
    .option('--no-throw-errors', 'throw errors instead of catching')
    .option('--no-timing', 'disable performance timing table')
    .action(
        async (
            input: string,
            output: string,
            options: {
                prettier: boolean
                pref: boolean
                throwErrors: boolean
                timing: boolean
            }
        ) => {
            output = output || guessOutput(input)

            try {
                // 删除可能存在的输出文件（异步，忽略错误）
                try {
                    await unlink(output)
                } catch {}

                // 异步读取源文件
                const source = await readFile(input, 'utf-8')

                // 设置性能标记（如果启用计时）
                if (options.timing !== false) {
                    performance.mark('parse-start')
                    performance.mark('transform-start')
                    performance.mark('generate-start')
                }

                const result = await formatSource(source, {
                    usePrettier: options.prettier !== false,
                    pref: options.pref !== false,
                    throwErrors: options.throwErrors === true,
                })

                // 异步写入结果
                await writeFile(output, result, 'utf-8')
                console.log(`Formatted source written to ${output}`)

                // 打印耗时表格
                if (options.timing !== false) {
                    performance.mark('parse-end')
                    performance.mark('transform-end')
                    performance.mark('generate-end')

                    const labels = ['parse', 'transform', 'generate'] as const
                    const timing: [string, number][] = []
                    for (const label of labels) {
                        try {
                            performance.measure(
                                label,
                                `${label}-start`,
                                `${label}-end`
                            )
                            const entries = performance.getEntriesByName(label)
                            if (entries.length) {
                                timing.push([label, entries[0].duration])
                            }
                        } catch {}
                    }
                    const total = timing.reduce((p, a) => p + a[1], 0)
                    if (timing.length) {
                        const tableData = Object.fromEntries(
                            timing.map(([name, dur]) => [
                                name,
                                {
                                    Time: `${dur.toFixed(2)}ms`,
                                    Ratio: `${((dur / total) * 100).toFixed(2)}%`,
                                },
                            ])
                        )
                        console.table(tableData, ['Time', 'Ratio'])
                        console.log(`Total: ${total.toFixed(2)}ms`)
                    }
                }
            } catch (err) {
                if (err instanceof Error) {
                    console.error(
                        'Error during uncompress:',
                        err.stack
                            ?.split('\n')
                            .filter(line => !line.includes('node_modules'))
                            .join('\n')
                    )
                } else {
                    console.error('Error during uncompress:', err)
                }
                process.exit(1)
            }
        }
    )

program
    .command('unbundle')
    .description('Unbundle a set of JS files into a directory')
    .argument('<inputDir>', 'directory containing source files')
    .argument('[outputDir]', 'output directory')
    .option('--filter <pattern>', 'file extension or glob pattern', '*.js')
    .option('--no-log', 'disable logging')
    .option('--no-clean', 'do not remove output directory before run')
    .action(
        async (
            inputDir: string,
            outputDir: string,
            options: {
                filter: string
                log: boolean
                clean: boolean
            }
        ) => {
            outputDir = outputDir || guessOutput(inputDir)

            try {
                const clean = options.clean !== false
                const enableLog = options.log !== false

                if (clean) {
                    await rm(outputDir, { recursive: true, force: true })
                }

                const sources: BundleSource[] = []

                for await (const filename of glob(options.filter, {
                    cwd: inputDir,
                })) {
                    const content = await readFile(
                        path.join(inputDir, filename),
                        'utf-8'
                    )
                    sources.push({
                        filename,
                        content,
                    })
                }

                if (sources.length === 0) {
                    console.log(
                        `No files matching "${options.filter}" found in ${inputDir}`
                    )
                    return
                }

                const result = await unbundle({
                    sources,
                    log: enableLog,
                })

                for (const [relpath, content] of Object.entries(
                    result.files
                )) {
                    if (content.includes('problems')) console.log(relpath)
                    const filepath = path.join(outputDir, relpath)
                    await mkdir(path.dirname(filepath), { recursive: true })
                    await writeFile(filepath, content, 'utf-8')
                }

                console.log(
                    `Unbundle completed. Output written to ${outputDir}`
                )
            } catch (err) {
                console.error('Error during unbundle:', err)
                process.exit(1)
            }
        }
    )

program
    .command('detect')
    .description('Detect the bundler type of a file')
    .argument('<input>', 'input file path')
    .action(async (input: string) => {
        try {
            const content = await readFile(input, 'utf-8')
            const type = detectBundle(content)
            console.log(`${path.basename(input)}: ${type}`)
        } catch (err) {
            console.error('Error during detect:', err)
            process.exit(1)
        }
    })

program.parse()
