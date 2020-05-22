import { parse, types as t, NodePath } from "@babel/core";
import { createMacro, MacroError } from "babel-plugin-macros";
import type { MacroParams } from "babel-plugin-macros";
import { stringify } from "javascript-stringify";
import deepCopy from "fast-copy";
import {
  getTypeParameter,
  getBlockParent as getStatementsInSameScope,
  getRegisterArguments,
  Errors,
  throwUnexpectedError,
  getStringParameters,
  throwMaybeAstError,
} from "./macro-assertions";
import { IR, BuiltinType, builtinTypes } from "./type-ir/IR";
import { registerType } from "./register";
import { getTypeParameterIR } from "./type-ir/astToTypeIR";
import generateValidator from "./code-gen/irToInline";
import instantiateIR, {
  InstantiationStatePartial,
  TypeInfo,
} from "./type-ir/passes/instantiate";
import resolveAllNamedTypes, {
  resolveSingleType,
} from "./type-ir/passes/resolve";
import flattenType from "./type-ir/passes/flatten";
import dumpValues, { stringifyValue, replaceWithCode } from "./debug-helper";
import callDump from "./debug-helper";
import * as u from "./type-ir/IRUtils";

function macroHandler({ references, state, babel }: MacroParams): void {
  // TODO: Use local namedTypes in TEST MODE only!!
  const namedTypes: Map<string, IR> = new Map();

  // TODO: Reduce duplication?
  const arrayBuiltin: BuiltinType<"Array"> = {
    type: "builtinType",
    typeName: "Array",
    elementTypes: [u.GenericType(0)],
    typeParametersLength: 1,
    typeParameterDefaults: [],
  };
  const mapBuiltin: BuiltinType<"Map"> = {
    type: "builtinType",
    typeName: "Map",
    elementTypes: [u.GenericType(0), u.GenericType(1)],
    typeParametersLength: 2,
    typeParameterDefaults: [],
  };
  const setBuiltin: BuiltinType<"Set"> = {
    type: "builtinType",
    typeName: "Set",
    elementTypes: [u.GenericType(0)],
    typeParametersLength: 1,
    typeParameterDefaults: [],
  };

  namedTypes.set("Array", arrayBuiltin);
  namedTypes.set("Map", mapBuiltin);
  namedTypes.set("Set", setBuiltin);

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
    if (builtinTypes.includes(typeName)) continue;
    namedTypes.set(typeName, flattenType(ir));
  }

  if (callDump(references, namedTypes, "__dumpAfterTypeFlattening")) return;

  const dumpInstantiatedName = "__dumpInstantiatedIR";
  if (references[dumpInstantiatedName]) {
    for (const path of references[dumpInstantiatedName]) {
      const callExpr = path.parentPath;
      const instantiatedTypes = new Map<string, TypeInfo>();
      const typeParam = getTypeParameter(path);
      let ir = getTypeParameterIR(typeParam.node);
      const state: InstantiationStatePartial = {
        instantiatedTypes,
        namedTypes,
        typeStats: new Map(),
      };
      ir = flattenType(ir);
      const patchedIR = instantiateIR(ir, state);
      instantiatedTypes.set("$$typeParameter$$", {
        typeStats: state.typeStats,
        value: patchedIR,
        circular: false,
      });
      const builtinsRemoved = deepCopy(instantiatedTypes);
      for (const builtin of builtinTypes) {
        builtinsRemoved.delete(builtin);
      }
      const stringified = stringifyValue(builtinsRemoved, "instantiatedTypes");
      replaceWithCode(stringified, callExpr);
    }
    return;
  }

  const instantiatedTypes = new Map<string, TypeInfo>();

  if (references.default) {
    for (const path of references.default) {
      const callExpr = path.parentPath;
      const typeParam = getTypeParameter(path);
      let ir = getTypeParameterIR(typeParam.node);
      const state: InstantiationStatePartial = {
        instantiatedTypes,
        namedTypes,
        typeStats: new Map(),
      };
      ir = flattenType(ir);
      const patchedIR = instantiateIR(ir, state);
      const code = generateValidator(patchedIR, instantiatedTypes);
      replaceWithCode(code, callExpr);
    }
  }
}

export default createMacro(macroHandler);
