import { MacroError, References } from "babel-plugin-macros";
import { NodePath, types as t, parse } from "@babel/core";
import { throwUnexpectedError, getStringParameters } from "./macro-assertions";
import { stringify } from "javascript-stringify";
import { IR } from "./type-ir/IR";

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

function dumpValues(
  paths: NodePath<t.Node>[],
  namedTypes: Map<string, IR>,
  exportedName: string
): void {
  for (const path of paths) {
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

export default function callDump(
  references: References & { default: NodePath<t.Node>[] },
  namedTypes: Map<string, IR>,
  dumpName: string
): boolean {
  const paths = references[dumpName];
  if (paths !== undefined) {
    dumpValues(paths, namedTypes, dumpName);
    return true;
  }
  return false;
}
