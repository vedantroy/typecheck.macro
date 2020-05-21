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
import patchIR, {
  InstantiationStatePartial,
  TypeInfo,
} from "./type-ir/passes/instantiate";
import resolveAllNamedTypes from "./type-ir/passes/resolve";
import flattenType from "./type-ir/passes/flatten";
import dumpValues, { stringifyValue, replaceWithCode } from "./debug-helper";
import callDump from "./debug-helper";

function macroHandler({ references, state, babel }: MacroParams): void {
  // TODO: Use local namedTypes in TEST MODE only!!
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

  if (callDump(references, namedTypes, "__dumpAfterRegistration", true)) return;

  resolveAllNamedTypes(namedTypes);

  if (callDump(references, namedTypes, "__dumpAfterTypeResolution")) return;

  for (const [typeName, ir] of namedTypes) {
    namedTypes.set(typeName, flattenType(ir));
  }

  if (callDump(references, namedTypes, "__dumpAfterTypeFlattening")) return;

  const dumpInstantiatedName = "__dumpInstantiatedIR";
  if (references[dumpInstantiatedName]) {
    for (const path of references[dumpInstantiatedName]) {
      const callExpr = path.parentPath;
      const instantiatedTypes = new Map<string, TypeInfo>();
      const typeParam = getTypeParameter(path);
      const ir = getTypeParameterIR(typeParam.node);
      const state: InstantiationStatePartial = {
        instantiatedTypes,
        namedTypes,
        typeStats: new Map(),
      };
      const patchedIR = patchIR(ir, state);
      instantiatedTypes.set("$$typeParameter$$", {
        typeStats: state.typeStats,
        value: patchedIR,
        circular: false,
      });
      const stringified = stringifyValue(
        instantiatedTypes,
        "instantiatedTypes"
      );
      replaceWithCode(stringified, callExpr);
    }
    return;
  }

  const instantiatedTypes = new Map<string, TypeInfo>();

  if (references.default) {
    for (const path of references.default) {
      const callExpr = path.parentPath;
      const typeParam = getTypeParameter(path);
      const ir = getTypeParameterIR(typeParam.node);
      const state: InstantiationState = {
        instantiatedTypes,
        namedTypes,
        typeStats: new Map(),
      };
      const patchedIR = patchIR(ir, state);
      callExpr.remove();
    }
  }
}

export default createMacro(macroHandler);
