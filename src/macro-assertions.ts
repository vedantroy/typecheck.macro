/**
 *  This file contains compile time helpers to validate that the macro is being called appropriately.
 */
import { NodePath, types as t } from "@babel/core";
import { MacroError } from "babel-plugin-macros";
import { oneLine, stripIndent } from "common-tags";

// This is used in the tests to check if a particular error has been thrown
// by checking if the error message has a substring
// that matches a given entry in this object
export const ErrorBase = {
  ValidatorNoTypeParameter: `Failed to find type parameter. createValidator should be called with a type parameter. Example: "createValidator<TypeName>()"`,
  NotCalledAsFunction: `Macro should be called as function but was called as a`,
  MoreThanOneTypeParameter: `Macro should be called with 1 type parameter but was called with`,
  RegisterInvalidCall: stripIndent`
                                "register" should be called right below the type
                                declaration it is registering:
                                \`\`\`
                                interface Foo {
                                  bar: string
                                }
                                // no return value
                                register<Foo>()
                                \`\`\`
                                `,
  UnregisteredType: `Tried to generate a validator for an unregistered type with name`,
  // TODO: These will need to be updated once register accepts an options object
  RegisterInvalidNumberParams: `register should be called with 1 argument, but it was called with`,
  RegisterParam1NotStringLiteral: `register's first (and only) parameter should be a string literal, which is the name of the type to register, but it was a`,
};

const removePeriod = (str: string) =>
  str.slice(-1) === "." ? str.slice(0, -1) : str;

const addNewline = (str: string) => (str.slice(-1) === "\n" ? str : str + "\n");

export const Errors = {
  // Definitely user errors
  NoTypeParameters: () => ErrorBase.ValidatorNoTypeParameter,
  NotCalledAsFunction: (callType: string) =>
    `${ErrorBase.NotCalledAsFunction} ${callType}`,
  MoreThanOneTypeParameter: (typeParams: number) =>
    `${ErrorBase.MoreThanOneTypeParameter} ${typeParams}`,
  InvalidRegisterCall: () => ErrorBase.RegisterInvalidCall,
  // Errors that indicate possible bugs in the macro itself
  InvalidNumberOfRegisterParams: (params: number) =>
    `${ErrorBase.RegisterInvalidNumberParams} ${params}`,
  RegisterParam1NotStringLiteral: (paramNode: t.Node) =>
    `${ErrorBase.RegisterParam1NotStringLiteral} ${paramNode.type}`,
  UnregisteredType: (typeName: string) =>
    `${ErrorBase.UnregisteredType}: ${typeName}`,
  UnexpectedError: (functionName: string, reason: string): string => {
    return oneLine`Unexpected error inside ${functionName} because ${removePeriod(
      reason
    )}. Please report this to the developer.`;
  },
  // TODO: Can remove optional parameter (probably)
  MaybeAstError: (
    functionName: string,
    reason: string,
    optional: string | undefined
  ): string => {
    return oneLine`Invalid AST node inside ${functionName} because ${removePeriod(
      reason
    )}. Most likely, your Typescript is invalid.
    ${
      optional !== undefined ? addNewline(optional) : ""
    }But if it isn't, please report this to the developer.`;
  },
};

// TODO: delete this
export const createErrorThrower = (
  functionName: string,
  generateErrorMessage:
    | typeof Errors.UnexpectedError
    | typeof Errors.MaybeAstError
) => {
  return (message: string, optional?: string) => {
    throw new MacroError(generateErrorMessage(functionName, message, optional));
  };
};

function assertCallExpr(
  expr: NodePath<t.Node>
): asserts expr is NodePath<t.Node> & NodePath<t.CallExpression> {
  if (!expr.isCallExpression())
    throw new MacroError(Errors.NotCalledAsFunction(expr.type));
}

function assertSingular<T>(
  expr: NodePath<T>[] | NodePath<T>
): asserts expr is NodePath<T> {
  if (expr === null || expr === undefined || Array.isArray(expr)) {
    throw new MacroError(
      Errors.UnexpectedError(
        assertSingular.name,
        `Expected expr to be single NodePath but it was ${expr}`
      )
    );
  }
}

export function getTypeDeclarationInBlock(
  typeName: string,
  block: NodePath<t.BlockStatement>,
  idxInBlock?: number
):
  | NodePath<t.TSInterfaceDeclaration>
  | NodePath<t.TSTypeAliasDeclaration>
  | null {
  const body = block.get("body");
  for (let i = 0; i < body.length; ++i) {
    if (i === idxInBlock) continue;
    const stmt = body[i];
    const { node } = stmt;
    if (t.isTSInterfaceDeclaration(node)) {
      const interfaceName = node.id.name;
      if (interfaceName === typeName) {
        return stmt as NodePath<t.TSInterfaceDeclaration>;
      }
    } else if (t.isTSTypeAliasDeclaration(node)) {
      const aliasName = node.id.name;
      if (aliasName === typeName) {
        return stmt as NodePath<t.TSTypeAliasDeclaration>;
      }
    }
  }
  return null;
}

// TODO: This will need to be more generic because
// dumpIr will use this too
export function getRegisterArguments(macroPath: NodePath<t.Node>): string {
  const callExpr = macroPath.parentPath;
  assertCallExpr(callExpr);
  const args = callExpr.node.arguments;
  if (args.length != 1) {
    throw new MacroError(Errors.InvalidNumberOfRegisterParams(args.length));
  }
  const typeNamePath = callExpr.get("arguments.0");
  assertSingular(typeNamePath);
  if (!typeNamePath.isStringLiteral()) {
    throw new MacroError(
      Errors.RegisterParam1NotStringLiteral(typeNamePath.node)
    );
  }
  const { confident, value: typeName } = typeNamePath.evaluate();
  if (confident === false || typeof typeName !== "string") {
    throw new MacroError(
      Errors.UnexpectedError(
        getRegisterArguments.name,
        `evaluation result had type ${typeof typeName} and confidence ${confident}`
      )
    );
  }
  return typeName;
}

export function getBlockParent(
  macroPath: NodePath<t.Node>
): NodePath<t.BlockStatement> {
  const callExpr = macroPath.parentPath;
  assertCallExpr(callExpr);
  const exprStmt = callExpr.parentPath;
  if (!exprStmt.isExpressionStatement())
    throw new MacroError(Errors.InvalidRegisterCall());

  const block = exprStmt.parentPath;
  if (!block.isBlockStatement())
    throw new MacroError(Errors.InvalidRegisterCall());

  const throwUnexpectedError: (message: string) => never = createErrorThrower(
    getBlockParent.name,
    Errors.UnexpectedError
  );

  if (typeof exprStmt.key === "string") {
    throwUnexpectedError(
      `exprStmt.key had type string even though its parent was of type BlockParent`
    );
  }
  return block;
  //return [block, exprStmt.key];
}

export function getTypeParameter(
  macroPath: NodePath<t.Node>
): NodePath<t.TSType> {
  const callExpr = macroPath.parentPath;
  assertCallExpr(callExpr);
  const typeParametersPath = callExpr.get("typeParameters");
  if (
    typeParametersPath &&
    !Array.isArray(typeParametersPath) &&
    typeParametersPath.node
  ) {
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
