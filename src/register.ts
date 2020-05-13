import { NodePath, types as t } from "@babel/core";
import { IR } from "./type-ir/typeIR";
import {
  getTypeDeclarationInBlock,
  createErrorThrower,
  Errors,
} from "./macro-assertions";
import getTypeIR from "./type-ir/astToTypeIR";
import { MacroError } from "babel-plugin-macros";
import { register } from "../dist/typecheck.macro";

const throwUnexpectedError = createErrorThrower(
  registerType.name,
  Errors.UnexpectedError
);

export function registerType(
  typeName: string,
  block: NodePath<t.BlockStatement>,
  namedTypes: Map<string, IR>
): void {
  const typeDecl = getTypeDeclarationInBlock(typeName, block);
  if (typeDecl === null) return;
  const { node } = typeDecl;
  let typeIR: IR;
  if (t.isTSTypeAliasDeclaration(node)) {
    debugger;
    typeIR = getTypeIR(node.typeAnnotation);
  } else if (t.isTSInterfaceDeclaration(node)) {
    debugger;
  } else {
    throwUnexpectedError(`type declaration had impossible type`);
  }
}
