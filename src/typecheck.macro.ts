import { parse, types as t, NodePath } from "@babel/core";
import { createMacro, MacroError } from "babel-plugin-macros";
import type { MacroParams } from "babel-plugin-macros";
import { stringify } from "javascript-stringify";
import {
  getTypeParameter,
  getBlockParent as getStatementsInSameScope,
  getRegisterArguments,
  Errors,
  throwUnexpectedError,
  getStringParameters,
  throwMaybeAstError,
} from "./macro-assertions";
import { IR } from "./type-ir/IR";
import { registerType } from "./register";
import { getTypeParameterIR } from "./type-ir/astToTypeIR";
import { generateValidator } from "./code-gen/irToInline";
import partiallyResolveIR, {
  PartialResolutionState,
  TypeInfo,
} from "./type-ir/passes/common_type_extraction";
import resolveAllNamedTypes from "./type-ir/passes/resolveTypes";
import flattenType from "./type-ir/passes/flatten";
import dumpValues from "./debug-helper";

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

  resolveAllNamedTypes(namedTypes);
  const afterResolveDumpHelperName = "__dumpAfterTypeResolution";
  if (references[afterResolveDumpHelperName]) {
    dumpValues(
      references[afterResolveDumpHelperName],
      namedTypes,
      afterResolveDumpHelperName
    );
  }

  for (const [typeName, ir] of namedTypes) {
    namedTypes.set(typeName, flattenType(ir));
  }

  const partiallyResolvedTypes = new Map<string, TypeInfo>();
  if (references.default) {
    for (const path of references.default) {
      const callExpr = path.parentPath;
      const typeParam = getTypeParameter(path);
      const ir = getTypeParameterIR(typeParam.node);
      const state: PartialResolutionState = {
        partiallyResolvedTypes,
        namedTypes,
        typeStats: new Map(),
      };
      debugger;
      const partiallyResolvedIR = partiallyResolveIR(ir, state);
      callExpr.remove();
      /*
      const code = generateValidator(ir, namedTypes);
      const parsed = parse(code);
      if (t.isFile(parsed)) {
        callExpr.replaceWith(parsed.program.body[0]);
      } else {
        throw new MacroError(
          Errors.UnexpectedError(`${code} was incorrectly parsed`)
        );
      }
      */
    }
  }
}

export default createMacro(macroHandler);
