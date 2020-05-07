import { NodePath, Node, types as t } from "@babel/core";
import { MacroError } from "babel-plugin-macros";

// This is used in the tests to check if a particular error has been thrown
// by comparing the message with a constant in this object
export const ErrorBase = {
  NoTypeParameters: `Failed to find type parameters. The macro should be called with a type parameter. Example: "createValidator<TypeName>()"`,
  NotCalledAsFunction: `Macro should be called as function but was called as a`,
  MoreThanOneTypeParameter: `Macro should be called with 1 type parameter but was called with`,
  NotTSTypeParameterInstantiation: `instead of TSTypeParameterInstantiation`,
};

const Errors = {
  NoTypeParameters: () => ErrorBase.NoTypeParameters,
  NotCalledAsFunction: (callType: string) =>
    `${ErrorBase.NotCalledAsFunction} ${callType}`,
  MoreThanOneTypeParameter: (typeParams: number) =>
    `${ErrorBase.MoreThanOneTypeParameter} ${typeParams}`,
  NotTSTypeParameterInstantiation: (type: string) =>
    `typeParameters node was ${type} ${ErrorBase.NotTSTypeParameterInstantiation}`,
};

export function assertCalledWithTypeParameter(path: NodePath<Node>) {
  debugger;
  if (!t.isCallExpression(path))
    throw new MacroError(Errors.NotCalledAsFunction(path.type));
  const typeParametersPath = path.get("typeParameters");
  if (
    typeParametersPath &&
    !Array.isArray(typeParametersPath) &&
    typeParametersPath.node
  ) {
    const { node } = typeParametersPath;
    if (t.isTSTypeParameterInstantiation(node)) {
      const params = node.params.length;
      if (params != 1)
        throw new MacroError(Errors.MoreThanOneTypeParameter(params));
    }
    throw new MacroError(Errors.NotTSTypeParameterInstantiation(node.type));
  }
  throw new MacroError(Errors.NoTypeParameters());
}

/*
export function assertIsStringLiteralNode(
  node: Node
): asserts node is StringLiteral {
  if (!(node.type === "StringLiteral")) {
    throw new MacroError(
      oneLine`The first argument must be a string literal with the same name as the type you want to validate
                  The macro received a ${node.type} instead`
    );
  }
}
*/
