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

function stringifyValue(val: unknown, varName: string): string {
  const stringified = stringify(val);
  if (stringified === undefined) {
    throwUnexpectedError(`Failed to stringify ${varName}, with value: ${val}`);
  }
  return stringified;
}

function insertCode(code: string, path: NodePath<t.Node>): void {
  const ast = parse(code);
  if (t.isFile(ast)) {
    path.replaceWith(ast.program.body[0]);
  } else {
    throwUnexpectedError(
      `${code} was incorrectly parsed. The AST was: ${JSON.stringify(ast)}`
    );
  }
}

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

  const exportedName = "__dumpAfterTypeResolution";
  if (references[exportedName]) {
    for (const path of references[exportedName]) {
      const typeNames = getStringParameters(path, exportedName);
      const selectedTypes = new Map<string, IR>();
      for (const name of typeNames) {
        const type = namedTypes.get(name);
        if (type === undefined) {
          throw new MacroError(`Failed to find type "${name}" in namedTypes`);
        }
        selectedTypes.set(name, type);
      }
      const stringified = stringifyValue(selectedTypes, "selectedTypes");
      insertCode(stringified, path.parentPath);
    }
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
