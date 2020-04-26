import type { NodePath, Node } from "@babel/core";
import type { StringLiteral } from "@babel/types";
import { createMacro } from "babel-plugin-macros";
import type { MacroParams } from 'babel-plugin-macros'

function example({ references, state, babel }: MacroParams): void {
  references.default.forEach((referencePath) => {
    const [firstArgumentPath] = referencePath.parentPath.get("arguments") as NodePath<Node>[]
    console.log(firstArgumentPath)
    const functionCallPath = firstArgumentPath.parentPath
    functionCallPath.remove()
  })
  /*
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
  */
}
export default createMacro(example);
//const fake = createMacro(fakeMacro)
//export {fake}
