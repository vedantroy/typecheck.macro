//import { stringify } from "javascript-stringify";
import { NodePath, types as t } from "@babel/core";
import { parse } from "@babel/parser";
import { createMacro, MacroError } from "babel-plugin-macros";
import type { MacroParams } from "babel-plugin-macros";
import {
  getTypeParameter,
  Errors,
  getBlockParent as getStatementsInSameScope,
  getRegisterArguments,
} from "./macro-assertions";
import { IR } from "./type-ir/typeIR";
import { registerType } from "./register";
import { getTypeParameterIR } from "./type-ir/astToTypeIR";
import { generateValidator } from "./code-gen/irToInline";

function macroHandler({ references, state, babel }: MacroParams): void {
  const namedTypes: Map<string, IR> = new Map();

  if (references.register) {
    for (const path of references.register) {
      const callExpr = path.parentPath;
      const typeName = getRegisterArguments(path);
      const stmtsInSameScope = getStatementsInSameScope(path);
      registerType(typeName, stmtsInSameScope, namedTypes);
      callExpr.remove();
    }
  }

  if (references.default) {
    for (const path of references.default) {
      const callExpr = path.parentPath;
      const typeParam = getTypeParameter(path);
      const ir = getTypeParameterIR(typeParam.node);
      const code = generateValidator(ir, namedTypes);
      callExpr.replaceWith(parse(code).program.body[0]);
    }
  }

  // TODO: The option to dump IR should probably be loaded
  // from a config file, instead of exposing this debug macro
  if (references.__dumpAllIR) {
    references.__dumpAllIR.forEach((path) => {
      // convert the map to a json-serializable object
      const obj: Record<string, IR> = Object.create(null);
      for (const [key, val] of namedTypes.entries()) {
        obj[key] = val;
      }
      const stringifiedIr = JSON.stringify(obj);
      // We can do this because (most) JSON is valid Javascript
      // Object literals are only valid syntax if they are in an expression
      // on the right side of an operator. Parenthesizing the object literal
      // makes it an expression
      const irAsAst = parse(`(${stringifiedIr})`);
      path.replaceWith(irAsAst.program.body[0]);
    });
  }
}

export default createMacro(macroHandler);
