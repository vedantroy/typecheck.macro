import { types as t } from "@babel/core";
import { IR } from "./type-ir/typeIR";
import { getTypeDeclarationInBlock } from "./macro-assertions";
import { getInterfaceIR, getTypeAliasIR } from "./type-ir/astToTypeIR";

// TODO: Handle circular types (Well... don't handle them)
export function registerType(
  typeName: string,
  stmts: t.Statement[],
  namedTypes: Map<string, IR>
): void {
  const node = getTypeDeclarationInBlock(typeName, stmts);
  if (node === null) return;
  const externalTypes = new Set<string>();
  let typeIR: IR;
  if (t.isTSTypeAliasDeclaration(node)) {
    typeIR = getTypeAliasIR(node, externalTypes);
  } else {
    typeIR = getInterfaceIR(node, externalTypes);
  }
  namedTypes.set(typeName, typeIR);
  for (const externalType of externalTypes) {
    registerType(externalType, stmts, namedTypes);
  }
}
