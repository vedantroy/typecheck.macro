import { stringify } from "javascript-stringify";
import { parse } from "@babel/parser";
import { createMacro, MacroError } from "babel-plugin-macros";
import type { MacroParams } from "babel-plugin-macros";
import {
  getTypeParameter,
  createErrorThrower,
  Errors,
} from "./macro-assertions";
import generateTypeIR from "./type-ir/astToTypeIR";
import { fullIRToInline } from "./code-gen/irToInline";

/* Strategy: When we encounter a type, we perform double dispatch on it? We can use manual recursion
or path traversal. We serialize this type into some useful data structure. Then we have 2 options:
1 (easier): have a generic function that can take in this data structure and validate an object against it
- this is like the reverse of existing libraries
2. (harder): convert this generic data structure into an optimized function that is hand tailored for that data structure
*/

const throwUnexpectedError = createErrorThrower(
  macroHandler.name,
  Errors.UnexpectedError
);

function macroHandler({ references, state, babel }: MacroParams): void {
  if (references.default) {
    references.default.forEach((path) => {
      const callExpr = path.parentPath;
      const typeParam = getTypeParameter(callExpr);
      const ir = generateTypeIR(typeParam.node);
      const code = fullIRToInline(ir);
      callExpr.remove();
      //writeFileSync("validator.js", code);
    });
  }
  if (references.generateIr) {
    references.generateIr.forEach((path) => {
      const callExpr = path.parentPath;
      const typeParam = getTypeParameter(callExpr);
      const ir = generateTypeIR(typeParam.node);
      const stringifiedIr = stringify(ir);
      if (stringifiedIr !== undefined) {
        // object literals are not valid syntax unless they are
        // 1. in an expression or 2. on the RHS (assignment)
        // parenthesizing makes the object literal an expression
        const irAsAst = parse(`(${stringifiedIr})`);
        callExpr.replaceWith(irAsAst.program.body[0]);
      } else {
        throwUnexpectedError(
          `${ir} could not be stringified into JS representation`
        );
      }
    });
  }
}

export default createMacro(macroHandler);
