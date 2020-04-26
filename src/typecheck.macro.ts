import type { NodePath, Node } from "@babel/core";
import type { StringLiteral } from "@babel/types";
import { createMacro, MacroError } from "babel-plugin-macros";
import type { MacroParams } from "babel-plugin-macros";
import { stripIndent } from "common-tags";

function gemmafy({ references, state, babel }: MacroParams): void {
  references.default.forEach((referencePath) => {
    // TODO: Remove type assertions and replace with type guards
    // we need to assert that get("arguments") returns an array
    const argumentsPath = referencePath.parentPath.get("arguments")
    assertIsArray(argumentsPath)
    const firstArgumentPath = argumentsPath[0]
    assertIsStringLiteralNode(firstArgumentPath.node)
    const stringValue = firstArgumentPath.node.value
    const gemmafied = stringValue.split(" ").join(" 🐶 ");
    const gemmafyFunctionCallPath = firstArgumentPath.parentPath;
    const gemmafiedStringLiteralNode = babel.types.stringLiteral(gemmafied);
    gemmafyFunctionCallPath.replaceWith(gemmafiedStringLiteralNode);
  });
}

function assertIsArray(
  path: NodePath<Node> | NodePath<Node>[]
): asserts path is NodePath<Node>[] {
  if (!Array.isArray(path)) {
    throw new MacroError(
      `The macro was not called properly. Proper usage: createValidator(name: string, options: TypecheckOptions)`
    );
  }
}

function assertIsStringLiteralNode(node: Node): asserts node is StringLiteral {
  if (!(node.type === "StringLiteral")) {
    throw new MacroError(
      stripIndent`The first argument must be a string literal with the same name as the type you want to validate
                  The macro received a ${node.type} instead`
    );
  }
}

/*
function createValidators({ references, state, babel }: MacroParams): void {
  references.default.forEach((referencePath) => {
    const macroArgs = referencePath.parentPath.get("arguments");
    assertIsArray(macroArgs);
    const { node } = macroArgs[0];
    assertIsStringLiteralNode(node);
  });
}
*/

export default createMacro(gemmafy);