import { MacroError, References } from "babel-plugin-macros";
import { NodePath, types as t, parse } from "@babel/core";
import { throwUnexpectedError, getStringParameters } from "./macro-assertions";
import { stringify } from "javascript-stringify";

export function stringifyValue(val: unknown, varName: string): string {
  const stringified = stringify(val);
  if (stringified === undefined) {
    throwUnexpectedError(`Failed to stringify ${varName}, with value: ${val}`);
  }
  return stringified;
}

export function replaceWithCode(code: string, path: NodePath<t.Node>): void {
  const ast = parse(code);
  if (t.isFile(ast)) {
    path.replaceWith(ast.program.body[0]);
  } else {
    throwUnexpectedError(
      `${code} was incorrectly parsed. The AST was: ${JSON.stringify(ast)}`
    );
  }
}

function dumpValue<V>(
  path: NodePath<t.Node>,
  types: Map<string, V>,
  exportedName: string,
  copyAll: boolean = false
): void {
  const typeNames = copyAll
    ? types.keys()
    : getStringParameters(path, exportedName);
  const selectedTypes = new Map<string, V>();
  for (const name of typeNames) {
    const type = types.get(name);
    if (type === undefined) {
      throw new MacroError(`Failed to find type "${name}" in namedTypes`);
    }
    selectedTypes.set(name, type);
  }
  const stringified = stringifyValue(selectedTypes, "selectedTypes");
  replaceWithCode(stringified, copyAll ? path : path.parentPath);
}

function dumpValues<V>(
  paths: NodePath<t.Node>[],
  namedTypes: Map<string, V>,
  exportedName: string,
  copyAll: boolean = false
): void {
  for (const path of paths) {
    dumpValue(path, namedTypes, exportedName, copyAll);
  }
}

export default function callDump<V>(
  references: References & { default: NodePath<t.Node>[] },
  namedTypes: Map<string, V>,
  dumpName: string,
  copyAll: boolean = false
): boolean {
  const paths = references[dumpName];
  if (paths !== undefined) {
    dumpValues(paths, namedTypes, dumpName, copyAll);
    return true;
  }
  return false;
}
