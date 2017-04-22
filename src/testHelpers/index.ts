import { SourceMapConsumer } from 'source-map'
import {
	NewLineKind,
	ScriptTarget,
	transpileModule,
} from 'typescript'
import { FileTransformer } from '../helpers'

export function createAsserter(transformer: FileTransformer) {
	return function testCase(testName: string, content: string) {
		test(testName, () => {
			expect(transform(content, transformer)).toMatchSnapshot()
		})
	}
}

function transform(source: string, transformer: FileTransformer) {
	const { outputText, sourceMapText } = transpileModule(source, {
		compilerOptions: {
			newLine: NewLineKind.LineFeed,
			sourceMap: true,
			target: ScriptTarget.ESNext,
		},
		transformers: {
			after: [transformer],
		},
	})

	return {
		code: '\n' + outputText.replace('//# sourceMappingURL=module.js.map', ''),
		sourceMap: createSnapshotFriendlySourceMap(sourceMapText as string),
	}
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
	return result
}
