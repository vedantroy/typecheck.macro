import { NodePath, Node, types as t } from "@babel/core";
import { MacroError } from "babel-plugin-macros";
import type { TSType } from "@babel/types";
import { oneLine } from "common-tags";

// This is used in the tests to check if a particular error has been thrown
// by checking if the error message has a substring
// that matches a particular entry in this object
export const ErrorBase = {
  NoTypeParameters: `Failed to find type parameters. The macro should be called with a type parameter. Example: "createValidator<TypeName>()"`,
  NotCalledAsFunction: `Macro should be called as function but was called as a`,
  MoreThanOneTypeParameter: `Macro should be called with 1 type parameter but was called with`,
};

const Errors = {
  NoTypeParameters: () => ErrorBase.NoTypeParameters,
  NotCalledAsFunction: (callType: string) =>
    `${ErrorBase.NotCalledAsFunction} ${callType}`,
  MoreThanOneTypeParameter: (typeParams: number) =>
    `${ErrorBase.MoreThanOneTypeParameter} ${typeParams}`,
  InternalError: (functionName: string, reason: string): string => {
    return oneLine`Unexpected error inside ${functionName} because ${reason}${
      reason.slice(-1) === "." ? "" : "."
    } Please report this to the developer.`;
  },
};

// This needs to be an arrow function because we need the value of this inside
export const assertCalledWithTypeParameter = (path: NodePath<Node>): TSType => {
  if (!t.isCallExpression(path))
    throw new MacroError(Errors.NotCalledAsFunction(path.type));
  const typeParametersPath = path.get("typeParameters");
  if (
    typeParametersPath &&
    !Array.isArray(typeParametersPath) &&
    typeParametersPath.node
  ) {
    const internalErrorMessage = Errors.InternalError.bind(
      undefined,
      Errors.InternalError.name
    );
    const { node } = typeParametersPath;
    if (t.isTSTypeParameterInstantiation(node)) {
      const params = node.params.length;
      if (params != 1)
        throw new MacroError(Errors.MoreThanOneTypeParameter(params));
      const typeParameterPath = typeParametersPath.get("params.0");
      if (
        !Array.isArray(typeParameterPath) &&
        t.isTSType(typeParameterPath.node)
      ) {
        return typeParameterPath.node;
      } else {
        throw new MacroError(
          internalErrorMessage(
            `typeParameterPath was ${
              Array.isArray(typeParameterPath) ? "an array" : "not a TSType"
            }`
          )
        );
      }
    } else {
      throw new MacroError(
        internalErrorMessage(
          `typeParameters node was ${node.type} instead of TSTypeParameterInstantiation`
        )
      );
    }
  } else {
    throw new MacroError(Errors.NoTypeParameters());
  }
};

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
