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
import { stringify } from "javascript-stringify";
import { IR } from "./type-ir/typeIR";
import { registerType } from "./register";

const throwUnexpectedError: (
  message: string,
  optional?: string
) => never = createErrorThrower(macroHandler.name, Errors.UnexpectedError);

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
  // We need this because in the ir tests
  // namedTypes is global across every test
  // meaning later tests will have the types from earlier tests
  // unless we reset it
  if (references.__resetAllIR) {
    namedTypes.clear();
    const stringLiteral = parse('("IR_DUMPED")').program.body[0];
    for (const path of references.__resetAllIR) {
      path.replaceWith(stringLiteral);
    }
  }

  if (references.register) {
    for (const path of references.register) {
      const callExpr = path.parentPath;
      const typeName = getRegisterArguments(path);
      const block = getBlockParent(path);
      registerType(typeName, block, namedTypes);
      callExpr.remove();
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
  if (references.default) {
    references.default.forEach((path) => {
      const callExpr = path.parentPath;
      const typeParam = getTypeParameter(path);
      /*
      const ir = getTypeIR(typeParam.node);
      const code = fullIRToInline(ir);
      */
      callExpr.remove();
      //writeFileSync("validator.js", code);
    });
  }
}

export default createMacro(macroHandler);
