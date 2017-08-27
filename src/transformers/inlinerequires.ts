import {
	isCallExpression,
	isIdentifier,
	isStringLiteral,
	isVariableStatement,
} from 'tsutils'
import {
	ArrayLiteralExpression,
	BinaryExpression,
	CallExpression,
	ConditionalExpression,
	createCall,
	createIdentifier,
	createLiteral,
	Identifier,
	Node,
	PropertyAccessExpression,
	ReturnStatement,
	SourceFile,
	Statement,
	SyntaxKind,
	TransformationContext,
	updateArrayLiteral,
	updateBinary,
	updateCall,
	updateConditional,
	updatePropertyAccess,
	updateReturn,
	updateSourceFileNode,
	updateVariableDeclaration,
	VariableDeclaration,
	VariableStatement,
	visitEachChild as _visitEachChild,
	visitNodes,
	VisitResult as _VisitResult,
} from 'typescript'

// the visitEachChild in TS is not strict-null-checks friendly
type VisitResult = _VisitResult<Node> | undefined
const visitEachChild = _visitEachChild as (
	node: Node,
	visitor: (node: Node) => VisitResult,
	context: TransformationContext,
) => Node | undefined

// TODO ensure import/require destructuring works

// make a visitor like visitTypeScript in ts transformer, visiting explicitly nodes that
// can have identifiers as direct children. everything else gets visitEachChild

export function inlineRequires(context: TransformationContext) {
	const requiredModules = new Map<string, string>() // <IdentifierName, ModuleName>
	let currentSourceFile: SourceFile
	function nodeText(node: Node) {
		return currentSourceFile.getFullText().substring(node.pos, node.end).trim()
	}

	function transformSourceFile(sourceFile: SourceFile) {
		if (sourceFile.isDeclarationFile) {
			return sourceFile
		}

		currentSourceFile = sourceFile
		return updateSourceFileNode(
			sourceFile,
			visitNodes(sourceFile.statements, visitSourceFileStatement),
		)
	}

	function visitSourceFileStatement(statement: Statement) {
		if (isVariableStatement(statement)) {
			return visitPossibleRequire(statement)
		} else {
			return visitEachChild(statement, visitNode, context)
		}
	}

	function visitPossibleRequire(statement: VariableStatement) {
		if (
			!statement.declarationList ||
			!statement.declarationList.declarations ||
			!statement.declarationList.declarations.length
		) {
			return visitEachChild(statement, visitNode, context)
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
			return visitEachChild(statement, visitNode, context)
		}

		const argument = initializer.arguments[0]
		if (
			!(initializer.arguments.length === 1) ||
			!isStringLiteral(argument) ||
			!isIdentifier(name)
		) {
			return visitEachChild(statement, visitNode, context)
		}

		requiredModules.set(name.text, argument.text)

		// drop the statement from the source file
		return undefined as any
	}

	function visitNode(node: Node): VisitResult {
		// SyntaxKind
		// nodeText
		// debugger

		// parent syntax kinds that can have identifiers as children
		// subject to inline require replacements
		switch (node.kind) {
			case SyntaxKind.VariableDeclaration:
				return visitVariableDeclaration(node as VariableDeclaration)
			case SyntaxKind.PropertyAccessExpression:
				return visitPropertyAccess(node as PropertyAccessExpression)
			case SyntaxKind.CallExpression:
				return visitCallExpression(node as CallExpression)
			case SyntaxKind.BinaryExpression:
				return visitBinaryExpression(node as BinaryExpression)
			case SyntaxKind.ConditionalExpression:
				return visitConditionalExpression(node as ConditionalExpression)
			case SyntaxKind.ReturnStatement:
				return visitReturnStatement(node as ReturnStatement)
			case SyntaxKind.ArrayLiteralExpression:
				return visitArrayLiteralExpression(node as ArrayLiteralExpression)

			default:
				return visitEachChild(node, visitNode, context)
		}
	}

	function visitVariableDeclaration(node: VariableDeclaration) {
		if (node.initializer && isIdentifier(node.initializer) && requiredModules.get(node.initializer.text)) {
			return updateVariableDeclaration(node, node.name, node.type, createRequireFrom(node.initializer))
		}
		return visitEachChild(node, visitNode, context)
	}

	function visitPropertyAccess(node: PropertyAccessExpression) {
		if (isIdentifier(node.expression) && requiredModules.get(node.expression.text)) {
			return updatePropertyAccess(node, createRequireFrom(node.expression), node.name)
		}
		return visitEachChild(node, visitNode, context)
	}

	function visitCallExpression(node: CallExpression) {
		const shouldTransformExpression =
			isIdentifier(node.expression) &&
			!!requiredModules.get(node.expression.text)

		const expression = shouldTransformExpression
			? createRequireFrom(node.expression as Identifier)
			: visitNode(node.expression) as any

		const args = visitNodes(node.arguments, arg => {
			if (isIdentifier(arg) && requiredModules.get(arg.text)) {
				return createRequireFrom(arg)
			}
			return visitNode(arg)!
		})

		return updateCall(
			node,
			expression,
			node.typeArguments,
			args,
		)
	}

	function visitBinaryExpression(node: BinaryExpression) {
		if (isIdentifier(node.right) && requiredModules.get(node.right.text)) {
			return updateBinary(
				node,
				node.left,
				createRequireFrom(node.right),
				node.operatorToken,
			)
		}
		return visitEachChild(node, visitNode, context)
	}

	function visitConditionalExpression(node: ConditionalExpression) {
		const replaceCondition = isIdentifier(node.condition) &&
			requiredModules.get(node.condition.text) &&
			node.condition
		const replaceWhenTrue = isIdentifier(node.whenTrue) &&
			requiredModules.get(node.whenTrue.text) &&
			node.whenTrue
		const replaceWhenFalse = isIdentifier(node.whenFalse) &&
			requiredModules.get(node.whenFalse.text) &&
			node.whenFalse
		if (replaceCondition || replaceWhenTrue || replaceWhenFalse) {
			return updateConditional(
				node,
				replaceCondition ? createRequireFrom(replaceCondition) : node.condition,
				replaceWhenTrue ? createRequireFrom(replaceWhenTrue) : node.whenTrue,
				replaceWhenFalse ? createRequireFrom(replaceWhenFalse) : node.whenFalse,
			)
		}
		return visitEachChild(node, visitNode, context)
	}

	function visitReturnStatement(node: ReturnStatement) {
		if (node.expression && isIdentifier(node.expression) && requiredModules.get(node.expression.text)) {
			return updateReturn(node, createRequireFrom(node.expression))
		}
		return visitEachChild(node, visitNode, context)
	}

	function visitArrayLiteralExpression(node: ArrayLiteralExpression) {
		return updateArrayLiteral(
			node,
			visitNodes(node.elements, arg => {
				if (isIdentifier(arg) && requiredModules.get(arg.text)) {
					return createRequireFrom(arg)
				}
				return visitNode(arg)!
			}),
		)
	}

	function createRequireFrom({ text }: Identifier) {
		const moduleName = requiredModules.get(text)!
		return createCall(
			createIdentifier('require'),
			undefined /* type arguments */,
			[toStringLiteral(moduleName)],
		)
	}

	function toStringLiteral(moduleId: string) {
		return createLiteral(moduleId.replace(/"|'/g, ''))
	}

	return transformSourceFile
}
