//import { stringify } from "javascript-stringify";
import { NodePath, types as t } from "@babel/core";
import { parse } from "@babel/parser";
import { createMacro, MacroError } from "babel-plugin-macros";
import type { MacroParams } from "babel-plugin-macros";
import {
  getTypeParameter,
  createErrorThrower,
  Errors,
  getBlockParent,
  getRegisterArguments,
  getTypeDeclarationInBlock,
} from "./macro-assertions";
import getTypeIR from "./type-ir/astToTypeIR";
import { fullIRToInline } from "./code-gen/irToInline";
import { IR } from "./type-ir/typeIR";
import { registerType } from "./register";

const throwUnexpectedError = createErrorThrower(
  macroHandler.name,
  Errors.UnexpectedError
);

const throwMaybeAstError = createErrorThrower(
  macroHandler.name,
  Errors.MaybeAstError
);

const namedTypes: Map<string, IR> = new Map();

// have generic-type with an index to the generic type name
// in post processing step, look @ generic type name an either replace the
// node with a type reference or the actual thing

// if it's a generic type instantiation,
// repeat step 1 but with that type's IR and the parameters

function macroHandler({ references, state, babel }: MacroParams): void {
  if (references.register) {
    for (const path of references.register) {
      const callExpr = path.parentPath;
      const typeName = getRegisterArguments(path);
      const block = getBlockParent(path);
      registerType(typeName, block, namedTypes);
      callExpr.remove();
    }
  }
  if (references.default) {
    references.default.forEach((path) => {
      const callExpr = path.parentPath;
      const typeParam = getTypeParameter(path);
      const ir = getTypeIR(typeParam.node);
      const code = fullIRToInline(ir);
      callExpr.remove();
      //writeFileSync("validator.js", code);
    });
  }
  if (references.generateIr) {
    // TODO: Refactor to use string name for type
    references.generateIr.forEach((path) => {
      const callExpr = path.parentPath;
      const typeParam = getTypeParameter(path);
      const ir = getTypeIR(typeParam.node);
      const stringifiedIr = JSON.stringify(ir); //stringify(ir);
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
