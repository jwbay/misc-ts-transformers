import {
	isCallExpression,
	isIdentifier,
	isStringLiteral,
	isVariableStatement,
} from 'tsutils'
import {
	createCall,
	createIdentifier,
	createLiteral,
	FunctionLikeDeclaration,
	Identifier,
	Node,
	ParameterDeclaration,
	SourceFile,
	SyntaxKind,
	TransformationContext,
	updateSourceFileNode,
	visitLexicalEnvironment,
} from 'typescript'

// get access to internals
// tslint:disable-next-line:no-var-requires
const ts = require('typescript')
const updateNode: <T extends Node>(updated: T, original: T) => T = ts.updateNode
const isIdentifierName: (node: Identifier) => boolean = ts.isIdentifierName

interface RequireCall {
	moduleId: string
	variableName: string
}

export function inlineRequires(context: TransformationContext) {
	const previousOnSubstituteNode = context.onSubstituteNode
	const identifiersToReplace: RequireCall[] = []

	// step 1: gather top level requires statements, record and drop them
	function transformSourceFile(node: SourceFile) {
		if (node.isDeclarationFile) {
			return node
		}

		return updateSourceFileNode(
			node,
			visitLexicalEnvironment(
				node.statements,
				visitSourceFileStatement,
				context,
				0,
				context.getCompilerOptions().alwaysStrict,
			),
		)
	}

	// step 2: replace references to the dropped identifiers with inline require calls
	context.enableSubstitution(SyntaxKind.Identifier)
	context.onSubstituteNode = (hint, node) => {
		node = previousOnSubstituteNode(hint, node)

		if (isIdentifier(node)) {
			return visitIdentifer(node)
		}

		return node
	}

	function visitSourceFileStatement(statement: Node) {
		if (!statement || !(isVariableStatement(statement))) {
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

		// TODO need to deal with shadowing. no type information available. use emit callbacks for
		// nodes that can introduce new scopes, and walk children for variable declarations?

		// TODO look at resolver, the ts transform elides imports only referenced for types
		identifiersToReplace.push({
			moduleId: argument.text,
			variableName: name.text,
		})

		// drop the statement from the source file
		return null as any
	}

	function visitIdentifer(node: Identifier) {
		// when we visit a node we've already modified, it's a 'synthesized node' with no parent
		if (!node.parent) {
			return node
		}

		if (!shouldReplaceIdentifierWithInlineRequire(node)) {
			return node
		}

		const foundId = identifiersToReplace.find(id => id.variableName === node.text)
		if (!foundId) {
			return node
		}

		const replacementRequire = createCall(
			createIdentifier('require'),
			undefined, // type arguments
			[toStringLiteral(foundId.moduleId)],
		)

		// this is possibly bad because there may be slots for identifiers
		// that require statements don't make sense in, alternative is to visit
		// each possible parent of an identifier independently
		return updateNode<Identifier>(replacementRequire as any, node)
	}

	function shouldReplaceIdentifierWithInlineRequire(node: Identifier) {
		const parent = node.parent!
		const grandparent = parent.parent || {} as Node

		if (isReferenceToIdentifier(node)) {
			return true
		}

		// function(a = replaceme.abc)
		if (isLeftMostPartOfInitializer(node, parent)) {
			return true
		}

		// const x = replaceme.abc, not const x = something.replaceme.abc
		if (parent.kind === SyntaxKind.PropertyAccessExpression && grandparent.kind !== SyntaxKind.PropertyAccessExpression) {
			return true
		}

		if (parent.kind === SyntaxKind.CallExpression) {
			return true
		}

		if (!isIdentifierName(node)) {
			return false
		}

		return false
	}

	function isLeftMostPartOfInitializer(node: Identifier, parent: Node) {
		const initializer = (parent as ParameterDeclaration).initializer

		// false because the initializer is synthetic (constructed by ES2015 transformer)
		// optionally check .text because the transformed is an IdentifierObject, which has that
		return initializer === node
	}

	function toStringLiteral(moduleId: string) {
		return createLiteral(moduleId.replace(/"|'/g, ''))
	}

	return transformSourceFile
}

/*
interesting utils:
isRequireCall

and for scopes:
getContainingClass
getContainingFunction
getEnclosingBlockScopeContainer
isBlockScope
isDeclarationKind
isDeclarationName
isFunctionLikeKind
isIdentifierName !!!!!!!! <--- THIS ONE
isNodeDescendantOf
isStatementWithLocals
isTypeNode
nodeStartsNewLexicalEnvironment

maybe !VariableLikeDeclaration?

probably need this:
isPartOfTypeNode
*/

function isReferenceToIdentifier(node: Identifier): boolean {
	const parent = node.parent || {} as Node

	if (typeof parent.kind === 'undefined') {
		return false
	}

	switch (parent.kind) {
		// yes: PARENT[NODE]
		// yes: NODE.child
		// no: parent.NODE
		case SyntaxKind.ElementAccessExpression:
		case SyntaxKind.JSXMemberExpression:
			if (parent.property === node && parent.computed) {
				return true
			} else if (parent.object === node) {
				return true
			} else {
				return false
			}

		// no: new.NODE
		// no: NODE.target
		case SyntaxKind.MetaProperty:
			return false

		// yes: { [NODE]: "" }
		// yes: { NODE }
		// no: { NODE: "" }
		case SyntaxKind.ObjectProperty:
			if (parent.key === node) {
				return parent.computed
			}

		// no: let NODE = init;
		// yes: let id = NODE;
		case SyntaxKind.VariableDeclarator:
			return parent.id !== node

		// no: function foo(NODE: any) {}
		case SyntaxKind.Parameter:
			return false

		// no: function NODE() {}
		// no: function foo(NODE) {}
		case SyntaxKind.ArrowFunction:
		case SyntaxKind.FunctionDeclaration:
		case SyntaxKind.FunctionExpression:
			return false
		// for (const param of ((parent as FunctionLikeDeclaration).parameters) {
		// 	if (param === node) {
		// 		return false
		// 	}
		// }

		// return parent.id !== node

		// no: export { foo as NODE };
		// yes: export { NODE as foo };
		// no: export { NODE as foo } from "foo";
		case SyntaxKind.ExportSpecifier:
			if (parent.source) {
				return false
			} else {
				return parent.local === node
			}

		// no: export NODE from "foo";
		// no: export * as NODE from "foo";
		case SyntaxKind.ExportNamespaceSpecifier:
		case SyntaxKind.ExportDefaultSpecifier:
			return false

		// no: <div NODE="foo" />
		case SyntaxKind.JSXAttribute:
			return parent.name !== node

		// no: class { NODE = value; }
		// yes: class { [NODE] = value; }
		// yes: class { key = NODE; }
		case SyntaxKind.ClassProperty:
			if (parent.key === node) {
				return parent.computed
			} else {
				return parent.value === node
			}

		// no: import NODE from "foo";
		// no: import * as NODE from "foo";
		// no: import { NODE as foo } from "foo";
		// no: import { foo as NODE } from "foo";
		// no: import NODE from "bar";
		case SyntaxKind.ImportDefaultSpecifier:
		case SyntaxKind.ImportNamespaceSpecifier:
		case SyntaxKind.ImportSpecifier:
			return false

		// no: class NODE {}
		case SyntaxKind.ClassDeclaration:
		case SyntaxKind.ClassExpression:
			return parent.id !== node

		// yes: class { [NODE]() {} }
		case SyntaxKind.ClassMethod:
		case SyntaxKind.ObjectMethod:
			return parent.key === node && parent.computed

		// no: NODE: for (;;) {}
		case SyntaxKind.LabeledStatement:
			return false

		// no: try {} catch (NODE) {}
		case SyntaxKind.CatchClause:
			return parent.param !== node

		// no: function foo(...NODE) {}
		case SyntaxKind.RestElement:
			return false

		// yes: left = NODE;
		// no: NODE = right;
		case SyntaxKind.AssignmentExpression:
			return parent.right === node

		// no: [NODE = foo] = [];
		// yes: [foo = NODE] = [];
		case SyntaxKind.AssignmentPattern:
			return parent.right === node

		// no: [NODE] = [];
		// no: ({ NODE }) = [];
		case SyntaxKind.ObjectPattern:
		case SyntaxKind.ArrayPattern:
			return false
	}

	return true
}
