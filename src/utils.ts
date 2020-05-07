import { NodePath, Node, types as t } from "@babel/core";
import type { StringLiteral, TSTypeParameterInstantiation } from "@babel/types";
import { MacroError } from "babel-plugin-macros";
import { stripIndent } from "common-tags";

function assertIsSingularPath(
  path: NodePath<Node> | NodePath<Node>[]
): asserts path is NodePath<Node> {}

export function assertCalledWithTypeParameter(path: NodePath<Node>) {
  debugger;
  if (!t.isCallExpression(path)) {
    throw new MacroError(
      `Macro should be called as a function but was called as a ${path.type}`
    );
  }
  const typeParametersPath = path.get("typeParameters");
  if (typeParametersPath && !Array.isArray(typeParametersPath)) {
    const { node } = typeParametersPath;
    if (t.isTSTypeParameterInstantiation(node)) {
      const params = node.params.length;
      if (params != 1) {
        throw new MacroError(
          `Macro should be called with 1 type parameter but was called with ${params}`
        );
      }
    } else {
      throw new MacroError(
        `typeParameters node was ${node.type} instead of TSTypeParameterInstantiation`
      );
    }
  } else {
    throw new MacroError(stripIndent`Failed to find type parameters. The macro should be called with a type parameter.
                            Example: "createValidator<Foo>()"`);
  }
}

export function assertIsStringLiteralNode(
  node: Node
): asserts node is StringLiteral {
  if (!(node.type === "StringLiteral")) {
    throw new MacroError(
      stripIndent`The first argument must be a string literal with the same name as the type you want to validate
                  The macro received a ${node.type} instead`
    );
  }
}
