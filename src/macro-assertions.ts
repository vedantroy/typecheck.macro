/**
 *  This file contains compile time helpers to validate that the macro is being called appropriately.
 */
import { NodePath, Node, types as t } from "@babel/core";
import { MacroError } from "babel-plugin-macros";
import { oneLine } from "common-tags";

// This is used in the tests to check if a particular error has been thrown
// by checking if the error message has a substring
// that matches a particular entry in this object
export const ErrorBase = {
  NoTypeParameters: `Failed to find type parameters. The macro should be called with a type parameter. Example: "createValidator<TypeName>()"`,
  NotCalledAsFunction: `Macro should be called as function but was called as a`,
  MoreThanOneTypeParameter: `Macro should be called with 1 type parameter but was called with`,
};

const removePeriod = (str: string) =>
  str.slice(-1) === "." ? str.slice(0, -1) : str;

export const Errors = {
  NoTypeParameters: () => ErrorBase.NoTypeParameters,
  NotCalledAsFunction: (callType: string) =>
    `${ErrorBase.NotCalledAsFunction} ${callType}`,
  MoreThanOneTypeParameter: (typeParams: number) =>
    `${ErrorBase.MoreThanOneTypeParameter} ${typeParams}`,
  // Errors that indicate possible bugs in the macro itself
  UnexpectedError: (functionName: string, reason: string): string => {
    return oneLine`Unexpected error inside ${functionName} because ${removePeriod(
      reason
    )}. Please report this to the developer.`;
  },
  MaybeAstError: (functionName: string, reason: string): string => {
    return oneLine`Invalid AST node inside ${functionName} because ${removePeriod(
      reason
    )}. Most likely, your Typescript is invalid.
    But if it isn't, please report this to the developer.`;
  },
};

// A helper function that makes it slightly less repetitive to
// throw errors that require the current function name
// (pass it into this function once instead of each instance of the error).
// Unclear if the extra indirection/lines of code are worth it
// TODO: I just realized these functions are slightly useless because stack traces have this information
// by default
export const createErrorThrower = (
  functionName: string,
  generateErrorMessage:
    | typeof Errors.UnexpectedError
    | typeof Errors.MaybeAstError
) => {
  return (message: string) => {
    throw new MacroError(generateErrorMessage(functionName, message));
  };
};

export function getTypeParameter(path: NodePath<Node>): NodePath<t.TSType> {
  t.isTSType;
  if (!t.isCallExpression(path))
    throw new MacroError(Errors.NotCalledAsFunction(path.type));
  const typeParametersPath = path.get("typeParameters");
  if (
    typeParametersPath &&
    !Array.isArray(typeParametersPath) &&
    typeParametersPath.node
  ) {
    // TODO: File a bug in the Typescript compiler. The never return type can be inferred, so why do we need to state it explictly?
    const throwUnexpectedError: (message: string) => never = createErrorThrower(
      getTypeParameter.name,
      Errors.UnexpectedError
    );
    const { node } = typeParametersPath;
    if (t.isTSTypeParameterInstantiation(node)) {
      const params = node.params.length;
      if (params != 1)
        throw new MacroError(Errors.MoreThanOneTypeParameter(params));
      const typeParameterPath = typeParametersPath.get("params.0");
      if (
        !Array.isArray(typeParameterPath) &&
        // @ts-ignore: https://github.com/babel/babel/issues/11535
        typeParameterPath.isTSType()
      ) {
        // @ts-ignore: https://github.com/babel/babel/issues/11535
        return typeParameterPath;
      }
      throwUnexpectedError(
        `typeParameter was ${
          Array.isArray(typeParameterPath) ? "an array" : "not a TSType"
        }`
      );
    }
    throwUnexpectedError(
      `typeParameters node was ${node.type} instead of TSTypeParameterInstantiation`
    );
  } else {
    throw new MacroError(Errors.NoTypeParameters());
  }
}
