import { createMacro, MacroError } from "babel-plugin-macros";
import type { MacroParams } from "babel-plugin-macros";
import deepCopy from "fast-copy";
import {
  getTypeParameter,
  getBlockParent as getStatementsInSameScope,
  getRegisterArguments,
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

const baseNamedTypes: ReadonlyMap<string, IR> = new Map([
  [
    "Array",
    {
      type: "builtinType",
      typeName: "Array",
      elementTypes: [u.GenericType(0)],
      typeParametersLength: 1,
      typeParameterDefaults: [],
    },
  ],
  [
    "Map",
    {
      type: "builtinType",
      typeName: "Map",
      elementTypes: [u.GenericType(0), u.GenericType(1)],
      typeParametersLength: 2,
      typeParameterDefaults: [],
    },
  ],
  [
    "Set",
    {
      type: "builtinType",
      typeName: "Set",
      elementTypes: [u.GenericType(0)],
      typeParametersLength: 1,
      typeParameterDefaults: [],
    },
  ],
]);

function removeBuiltins<K>(map: Map<string, K>): Map<string, K> {
  const builtinsRemoved = deepCopy(map);
  for (const builtin of builtinTypes) {
    builtinsRemoved.delete(builtin);
  }
  return builtinsRemoved;
}

// @ts-ignore - @types/babel-plugin-macros is out of date
function macroHandler({ references, state, babel }: MacroParams): void {
  const namedTypes: Map<string, IR> = deepCopy(baseNamedTypes) as Map<
    string,
    IR
  >;
  const instantiatedTypes: Map<string, TypeInfo> = new Map();

  if (references.register) {
    for (const path of references.register) {
      const callExpr = path.parentPath;
      const typeName = getRegisterArguments(path);
      const stmtsInSameScope = getStatementsInSameScope(path);
      registerType(typeName, stmtsInSameScope, namedTypes);
      callExpr.remove();
    }
  }

  if (
    callDump(
      references,
      removeBuiltins(namedTypes),
      "__dumpAfterRegistration",
      true
    )
  )
    return;

  resolveAllNamedTypes(namedTypes);

  if (
    callDump(
      references,
      removeBuiltins(namedTypes),
      "__dumpAfterTypeResolution"
    )
  )
    return;

  for (const [typeName, ir] of namedTypes) {
    if (builtinTypes.includes(typeName)) continue;
    namedTypes.set(typeName, flattenType(ir));
  }

  if (
    callDump(
      references,
      removeBuiltins(namedTypes),
      "__dumpAfterTypeFlattening"
    )
  )
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
        namedTypes,
        typeStats: new Map(),
      };
      ir = flattenType(ir);
      const patchedIR = instantiateIR(ir, state);
      instantiatedTypesToDump.set("$$typeParameter$$", {
        typeStats: state.typeStats,
        value: patchedIR,
        circular: false,
      });
      const stringified = stringifyValue(
        removeBuiltins(instantiatedTypesToDump),
        "instantiatedTypes"
      );
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
