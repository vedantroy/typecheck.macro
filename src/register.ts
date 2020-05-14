import { NodePath, types as t } from "@babel/core";
import { IR } from "./type-ir/typeIR";
import {
  getTypeDeclarationInBlock,
  Errors,
  throwUnexpectedError,
} from "./macro-assertions";
import getTypeIR, { IrGenState, getInterfaceIR } from "./type-ir/astToTypeIR";

// TODO: Handle circular types (Well... don't handle them)
export function registerType(
  typeName: string,
  block: NodePath<t.BlockStatement>,
  namedTypes: Map<string, IR>
): void {
  const typeDecl = getTypeDeclarationInBlock(typeName, block);
  if (typeDecl === null) return;
  const { node } = typeDecl;
  const externalTypes = new Set<string>();
  let typeIR: IR;
  if (t.isTSTypeAliasDeclaration(node)) {
    const state: IrGenState = {
      externalTypes,
      // Type Aliases cannot have generic parameters
      //(although they can instantiate generic types)
      // TODO: This was wrong (it won't be hard to fix though)
      // we can solve the issue by making a type alias a top
      // level type with genericParameterNames etc.
      genericParameterNames: [],
    };
    typeIR = getTypeIR(node.typeAnnotation, state);
  } else {
    if (!t.isTSInterfaceDeclaration(node)) {
      throwUnexpectedError(`type declaration had impossible type.`);
    }
    typeIR = getInterfaceIR(node, externalTypes);
  }
  namedTypes.set(typeName, typeIR);
  for (const externalType of externalTypes) {
    registerType(externalType, block, namedTypes);
  }
}
