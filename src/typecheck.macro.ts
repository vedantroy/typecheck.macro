import type { NodePath, Node } from "@babel/core";
import type { StringLiteral } from "@babel/types";
import { createMacro, MacroError, MacroParams } from "babel-plugin-macros";

function createValidator({ references, state, babel }: MacroParams): void {
  references.default.forEach((referencePath) => {
    // TODO: Remove type assertions and replace with type guards
    // we need to assert that get("arguments") returns an array
    const [firstArgumentPath] = referencePath.parentPath.get(
      "arguments"
    ) as NodePath<Node>[];
    const stringValue = (firstArgumentPath.node as StringLiteral).value;
    const gemmafied = stringValue.split(" ").join(" 🐶 ");
    const gemmafyFunctionCallPath = firstArgumentPath.parentPath;
    const gemmafiedStringLiteralNode = babel.types.stringLiteral(gemmafied);
    gemmafyFunctionCallPath.replaceWith(gemmafiedStringLiteralNode);
  });
}

export default createMacro(createValidator);
