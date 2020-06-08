import { NodePath, types as t } from "@babel/core";
import { createMacro } from "babel-plugin-macros";
import type { MacroParams } from "babel-plugin-macros";
import deepCopy from "fast-copy";
import generateValidator from "./code-gen/irToInline";
import callDump, { replaceWithCode, stringifyValue } from "./dump-helpers";
import {
  getBlockParent as getStatementsInSameScope,
  getRegisterArguments,
  getTypeParameter,
  throwUnexpectedError,
  getOptions,
} from "./macro-assertions";
import { registerType } from "./register";
import { getTypeParameterIR } from "./type-ir/astToTypeIR";
import { BuiltinType, BuiltinTypeName, builtinTypes, IR } from "./type-ir/IR";
import * as u from "./type-ir/IRUtils";
import cleanUnions from "./type-ir/passes/clean";
import flattenType from "./type-ir/passes/flatten";
import instantiateIR, {
  InstantiationStatePartial,
  TypeInfo,
} from "./type-ir/passes/instantiate";
import solveIntersections from "./type-ir/passes/intersect";
import resolveAllNamedTypes from "./type-ir/passes/resolve";

const baseNamedTypes: ReadonlyMap<
  BuiltinTypeName,
  BuiltinType<BuiltinTypeName>
> = new Map<BuiltinTypeName, BuiltinType<BuiltinTypeName>>([
  ["Array", u.BuiltinType("Array", u.GenericType(0), undefined)],
  ["Set", u.BuiltinType("Set", u.GenericType(0), undefined)],
  ["Map", u.BuiltinType("Map", u.GenericType(0), u.GenericType(1))],
]);

function removeBuiltins<K>(map: Map<string, K>): Map<string, K> {
  const builtinsRemoved = deepCopy(map);
  for (const builtin of builtinTypes) {
    builtinsRemoved.delete(builtin);
  }
  return builtinsRemoved;
}

function finalizeType(
  path: NodePath<t.Node>,
  instantiatedTypes: Map<string, TypeInfo>,
  namedTypes: Map<string, IR>
): [IR, Map<string, number>] {
  const typeParam = getTypeParameter(path);
  let ir = getTypeParameterIR(typeParam.node);
  const state: InstantiationStatePartial = {
    instantiatedTypes,
    namedTypes,
    typeStats: new Map(),
    newInstantiatedTypes: [],
  };
  // no type resolution on the type parameter
  ir = flattenType(ir);
  const instantiatedIR = instantiateIR(ir, state);
  for (const type of state.newInstantiatedTypes) {
    const newType = instantiatedTypes.get(type);
    if (newType === undefined) {
      throwUnexpectedError(`did not expected ${type} to be undefined`);
    }
    newType.value = cleanUnions(
      solveIntersections(newType.value, instantiatedTypes),
      instantiatedTypes
    );
    instantiatedTypes.set(type, newType);
  }
  const finalIR = cleanUnions(
    solveIntersections(instantiatedIR, instantiatedTypes),
    instantiatedTypes
  );
  return [finalIR, state.typeStats];
}

// @ts-ignore - @types/babel-plugin-macros is out of date
function macroHandler({ references, state, babel }: MacroParams): void {
  let fileName: string | null | undefined = state.file.opts.filename;
  if (fileName === null || fileName === undefined) {
    console.warn(`Failed to get fileName, using default fileName`);
    fileName = "unknown (failed to get file name)";
  }
  const namedTypes: Map<string, IR> = (deepCopy(
    baseNamedTypes
  ) as unknown) as Map<string, IR>;
  const instantiatedTypes: Map<string, TypeInfo> = new Map();

  const registerExportName = "registerType";
  if (references[registerExportName]) {
    for (const path of references[registerExportName]) {
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
      fileName,
      true
    )
  )
    return;

  resolveAllNamedTypes(namedTypes);

  if (
    callDump(
      references,
      removeBuiltins(namedTypes),
      "__dumpAfterTypeResolution",
      fileName
    )
  )
    return;

  for (const [typeName, ir] of namedTypes) {
    if (builtinTypes.includes(typeName as BuiltinTypeName)) continue;
    namedTypes.set(typeName, flattenType(ir));
  }

  if (
    callDump(
      references,
      removeBuiltins(namedTypes),
      "__dumpAfterTypeFlattening",
      fileName
    )
  )
    return;

  const dumpInstantiatedName = "__dumpInstantiatedIR";
  if (references[dumpInstantiatedName]) {
    for (const path of references[dumpInstantiatedName]) {
      const callExpr = path.parentPath;
      const instantiatedTypesToDump = new Map<string, TypeInfo>();
      const [finalIR, typeStats] = finalizeType(
        path,
        instantiatedTypesToDump,
        namedTypes
      );
      instantiatedTypesToDump.set("$$typeParameter$$", {
        typeStats,
        value: finalIR,
        circular: false,
      });
      const stringified = stringifyValue(
        instantiatedTypesToDump,
        "instantiatedTypes"
      );
      replaceWithCode(stringified, callExpr, fileName);
    }
    return;
  }

  if (references.default) {
    for (const path of references.default) {
      const callExpr = path.parentPath;
      const [finalIR, typeStats] = finalizeType(
        path,
        instantiatedTypes,
        namedTypes
      );
      const { circularRefs, allowForeignKeys } = getOptions(
        "boolean",
        path,
        "typecheck.macro's default export"
      );
      const code = generateValidator(finalIR, {
        instantiatedTypes,
        options: {
          errorMessages: false,
          expectedValueAsIR: false,
          circularRefs,
          allowForeignKeys,
        },
        typeStats,
      });
      replaceWithCode(code, callExpr, fileName);
    }
  }

  const detailExportName = "createDetailedValidator";
  if (references[detailExportName]) {
    for (const path of references[detailExportName]) {
      const callExpr = path.parentPath;
      const [finalIR, typeStats] = finalizeType(
        path,
        instantiatedTypes,
        namedTypes
      );
      const { circularRefs, expectedValueAsIR, allowForeignKeys } = getOptions(
        "detailed",
        path,
        detailExportName
      );
      const code = generateValidator(finalIR, {
        instantiatedTypes,
        options: {
          errorMessages: true,
          circularRefs,
          expectedValueAsIR,
          allowForeignKeys,
        },
        typeStats,
      });
      replaceWithCode(code, callExpr, fileName);
    }
  }
}

export default createMacro(macroHandler);
