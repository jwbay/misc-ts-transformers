import {
	collectVariableUsage,
	isCallExpression,
	isIdentifier,
	isStringLiteral,
	isVariableStatement,
	VariableInfo,
} from 'tsutils'
import {
	createCall,
	createIdentifier,
	createLiteral,
	Identifier,
	Node,
	SourceFile,
	SyntaxKind,
	TransformationContext,
	updateSourceFileNode,
	visitLexicalEnvironment,
} from 'typescript'

// get access to internals
// tslint:disable-next-line:no-var-requires
const ts = require('typescript')
const updateNode: <T extends Node, U extends Node>(updated: T, original: U) => T = ts.updateNode

// TODO ensure import/require destructuring works

export function inlineRequires(context: TransformationContext) {
	const previousOnSubstituteNode = context.onSubstituteNode
	const requires = new Map<Identifier, string>()
	let references: Map<Identifier, VariableInfo>

	// step 1: gather top level require statements, record usages, and drop them
	function transformSourceFile(sourceFile: SourceFile) {
		if (sourceFile.isDeclarationFile) {
			return sourceFile
		}

		references = collectVariableUsage(sourceFile)
		if (!references || references.size === 0) {
			return sourceFile
		}

		return updateSourceFileNode(
			sourceFile,
			visitLexicalEnvironment(
				sourceFile.statements,
				visitSourceFileStatement,
				context,
				undefined /* start */,
				context.getCompilerOptions().alwaysStrict,
			),
		)
	}

	// step 2: replace references to the dropped requires with inline require calls
	context.enableSubstitution(SyntaxKind.Identifier)
	context.onSubstituteNode = (hint, node) => {
		node = previousOnSubstituteNode(hint, node)

		if (isIdentifier(node)) {
			return visitIdentifer(node)
		}

		return node
	}

	function visitSourceFileStatement(statement: Node) {
		if (!statement || !isVariableStatement(statement)) {
			return statement
		}

		if (
			!statement.declarationList ||
			!statement.declarationList.declarations ||
			!statement.declarationList.declarations.length
		) {
			return statement
		}

		// doesn't currently handle const a = require('x'), b = require('y')
		const [{ name, initializer }] = statement.declarationList.declarations
		if (
			!initializer ||
			!isCallExpression(initializer) ||
			!initializer.expression ||
			!isIdentifier(initializer.expression) ||
			!(initializer.expression.text === 'require') ||
			!(isStringLiteral(initializer.arguments[0]))
		) {
			return statement
		}

		const argument = initializer.arguments[0]
		if (
			!(initializer.arguments.length === 1) ||
			!isStringLiteral(argument) ||
			!isIdentifier(name)
		) {
			return statement
		}

		requires.set(name, argument.text)

		// drop the statement from the source file
		return null as any
	}

	function visitIdentifer(node: Identifier) {
		const moduleId = findModuleIdForReference(node)

		if (!moduleId) {
			return node
		}

		const replacementRequire = createCall(
			createIdentifier('require'),
			undefined /* type arguments */,
			[toStringLiteral(moduleId)],
		)

		return updateNode(replacementRequire, node)
	}

	function findModuleIdForReference(node: Identifier) {
		for (const [declaration, usages] of references) {
			for (const { location } of usages.uses) {
				if (location === node && requires.has(declaration)) {
					return requires.get(declaration)
				}
			}
		}

		return undefined
	}

	function toStringLiteral(moduleId: string) {
		return createLiteral(moduleId.replace(/"|'/g, ''))
	}

	return transformSourceFile
}
