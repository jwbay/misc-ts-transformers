import { stripIndent } from 'common-tags'
import { SourceMapConsumer } from 'source-map'
import {
	JsxEmit,
	ModuleKind,
	NewLineKind,
	ScriptTarget,
	SourceFile,
	TransformationContext,
	transpileModule,
} from 'typescript'

export type FileTransformer = (context: TransformationContext) => (node: SourceFile) => SourceFile

export function createAsserter(transformer: FileTransformer) {
	return function testCase(testName: string, content: string, only = false) {
		const fn = only ? test.only : test
		fn(testName, () => {
			expect(transform(content, transformer)).toMatchSnapshot()
		})
	}
}

function transform(source: string, transformer: FileTransformer) {
	const { outputText, sourceMapText, diagnostics } = transpileModule(source, {
		compilerOptions: {
			jsx: JsxEmit.React,
			module: ModuleKind.CommonJS,
			newLine: NewLineKind.LineFeed,
			sourceMap: true,
			target: ScriptTarget.ES5,
		},
		fileName: 'module.tsx',
		reportDiagnostics: true,
		transformers: {
			after: [transformer],
		},
	})

	if (diagnostics && diagnostics.length > 0) {
		diagnostics.forEach(error => {
			// tslint:disable-next-line:no-console
			console.error(stripIndent`
				${error.messageText}
				${source.substr(Math.min(0, error.start! - 5), error.length! + 10)}
			`)
		})

		throw new Error('Syntax error')
	}

	return `
${createSnapshotFriendlySourceCode(source)}
>>>>>>>> transforms to >>>>>>>
${createSnapshotFriendlySourceCode(outputText)}
======= with source map ======
${createSnapshotFriendlySourceMap(sourceMapText as string)}`

}

function createSnapshotFriendlySourceCode(content: string) {
	return content
		.replace('//# sourceMappingURL=module.js.map', '')
		.replace(/"/g, `'`)
}

function createSnapshotFriendlySourceMap(sourceMapText: string) {
	const smc = new SourceMapConsumer(sourceMapText)
	const mappings: { [line: number]: string[] } = {}
	smc.eachMapping(({ generatedColumn, generatedLine, originalColumn, originalLine }) => {
		(mappings[generatedLine] || (mappings[generatedLine] = [])).push(
			`[${generatedLine},${generatedColumn} => ${originalLine},${originalColumn}]`,
		)
	})

	const result: { [line: string]: string } = {}
	Object.keys(mappings).forEach(line => {
		result['line ' + line] = mappings[line].join(', ')
	})
	return JSON.stringify(result, null, 2).replace(/"/g, '')
}
