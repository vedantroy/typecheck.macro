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

const namedTypes: Map<string, IR> = new Map();
const instantiatedTypes: Map<string, TypeInfo> = new Map();

const arrayBuiltin: BuiltinType<"Array"> = {
  type: "builtinType",
  typeName: "Array",
  elementTypes: [u.GenericType(0)],
  typeParametersLength: 1,
  typeParameterDefaults: [],
};

const setBuiltin: BuiltinType<"Set"> = {
  type: "builtinType",
  typeName: "Set",
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

namedTypes.set("Array", arrayBuiltin);
namedTypes.set("Map", mapBuiltin);
namedTypes.set("Set", setBuiltin);

// @ts-ignore - @types/babel-plugin-macros is out of date
function macroHandler({ references, state, babel, config }: MacroParams): void {
  const registerIsFiledScoped =
    config !== undefined && config.registerAcrossFiles === false;
  const fileScopedNamedTypes: Map<string, IR> = new Map();
  const fileScopedInstantiatedTypes: Map<string, TypeInfo> = new Map();

  function getNamedTypes(): Map<string, IR> {
    return registerIsFiledScoped ? fileScopedNamedTypes : namedTypes;
  }

  function getInstantiatedTypes(): Map<string, TypeInfo> {
    return registerIsFiledScoped
      ? fileScopedInstantiatedTypes
      : instantiatedTypes;
  }

  if (registerIsFiledScoped) {
    fileScopedNamedTypes.set("Array", arrayBuiltin);
    fileScopedNamedTypes.set("Map", mapBuiltin);
    fileScopedNamedTypes.set("Set", setBuiltin);
  }

  if (references.register) {
    for (const path of references.register) {
      const callExpr = path.parentPath;
      const typeName = getRegisterArguments(path);
      const stmtsInSameScope = getStatementsInSameScope(path);
      registerType(typeName, stmtsInSameScope, getNamedTypes());
      callExpr.remove();
    }
  }

  if (callDump(references, getNamedTypes(), "__dumpAfterRegistration", true))
    return;

  resolveAllNamedTypes(getNamedTypes());

  if (callDump(references, getNamedTypes(), "__dumpAfterTypeResolution"))
    return;

  for (const [typeName, ir] of getNamedTypes()) {
    if (builtinTypes.includes(typeName)) continue;
    getNamedTypes().set(typeName, flattenType(ir));
  }

  if (callDump(references, getNamedTypes(), "__dumpAfterTypeFlattening"))
    return;

  const dumpInstantiatedName = "__dumpInstantiatedIR";
  if (references[dumpInstantiatedName]) {
    for (const path of references[dumpInstantiatedName]) {
      const callExpr = path.parentPath;
      const instantiatedTypesToDump = new Map<string, TypeInfo>();
      const typeParam = getTypeParameter(path);
      let ir = getTypeParameterIR(typeParam.node);
      const state: InstantiationStatePartial = {
        instantiatedTypes: instantiatedTypesToDump,
        namedTypes: getNamedTypes(),
        typeStats: new Map(),
      };
      ir = flattenType(ir);
      const patchedIR = instantiateIR(ir, state);
      instantiatedTypesToDump.set("$$typeParameter$$", {
        typeStats: state.typeStats,
        value: patchedIR,
        circular: false,
      });
      const builtinsRemoved = deepCopy(instantiatedTypesToDump);
      for (const builtin of builtinTypes) {
        builtinsRemoved.delete(builtin);
      }
      const stringified = stringifyValue(builtinsRemoved, "instantiatedTypes");
      replaceWithCode(stringified, callExpr);
    }
    return;
  }

  if (references.default) {
    for (const path of references.default) {
      const callExpr = path.parentPath;
      const typeParam = getTypeParameter(path);
      let ir = getTypeParameterIR(typeParam.node);
      const state: InstantiationStatePartial = {
        instantiatedTypes: getInstantiatedTypes(),
        namedTypes: getNamedTypes(),
        typeStats: new Map(),
      };
      ir = flattenType(ir);
      const patchedIR = instantiateIR(ir, state);
      const code = generateValidator(patchedIR, getInstantiatedTypes());
      replaceWithCode(code, callExpr);
    }
  }
}

export default createMacro(macroHandler, { configName: "typecheck" });
