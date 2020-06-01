/**
 *  This file contains compile time helpers to validate that the macro is being called appropriately.
 */
import { NodePath, types as t } from "@babel/core";
import { MacroError } from "babel-plugin-macros";
import { oneLine, stripIndent } from "common-tags";
import { Tag } from "./type-ir/IR";

// This is used in order to reduce duplication in the compile error tests
// If you update a message in here, the corresponding compile error test will pass automatically.
// No updating needed.
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

  TypeDoesNotAcceptGenericParameters: `types don't accept generic parameters`,
  TooManyTypeParameters: `even though it only accepts`,
  NotEnoughTypeParameters: `type parameters even though it requires at least`,
  InvalidTypeParameterReference: `tried to reference the default type parameter in position:`,
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
  TypeDoesNotAcceptGenericParameters: (typeName: string, nodeType: Tag) =>
    `Tried to instantiate "${typeName}" with generic parameters even though ${nodeType} ${ErrorBase.TypeDoesNotAcceptGenericParameters}`,
  TooManyTypeParameters: (typeName: string, provided: number, actual: number) =>
    `Tried to instantiate ${typeName} with ${provided} type parameters ${ErrorBase.TooManyTypeParameters} ${actual}`,
  NotEnoughTypeParameters: (
    typeName: string,
    provided: number,
    actual: number
  ) =>
    `Tried to instantiate ${typeName} with ${provided} ${ErrorBase.NotEnoughTypeParameters} ${actual}`,
  InvalidTypeParameterReference: (
    paramPosition: number,
    referencedPosition: number
  ) =>
    oneLine`The default type parameter in position: ${paramPosition}
    ${ErrorBase.InvalidTypeParameterReference} ${referencedPosition}, which has not yet been instantiated`,
  UnexpectedError: (reason: string): string => {
    return oneLine`Unexpected error because ${removePeriod(
      reason
    )}. Please report this to the developer.`;
  },
  // TODO: Can remove optional parameter (probably)
  MaybeAstError: (reason: string, optional: string | undefined): string => {
    return oneLine`Invalid AST node because ${removePeriod(
      reason
    )}. Most likely, your Typescript is invalid.
    ${
      optional !== undefined ? addNewline(optional) : ""
    }But if it isn't, please report this to the developer.`;
  },
};

export const throwUnexpectedError: (msg: string) => never = (msg) => {
  throw new MacroError(Errors.UnexpectedError(msg));
};

export const throwMaybeAstError: (msg: string, optional?: string) => never = (
  msg,
  optional
) => {
  throw new MacroError(Errors.MaybeAstError(msg, optional));
};

function assertCallExpr(
  expr: NodePath<t.Node>
): asserts expr is NodePath<t.Node> & NodePath<t.CallExpression> {
  if (!expr.isCallExpression())
    throw new MacroError(Errors.NotCalledAsFunction(expr.type));
}

export function getStringParameters(
  macroPath: NodePath<t.Node>,
  functionName: string
): string[] {
  const callExpr = macroPath.parentPath;
  assertCallExpr(callExpr);
  const args = callExpr.get("arguments");
  assertArray(args);
  const strings: string[] = [];
  for (const arg of args) {
    const { confident, value } = arg.evaluate();
    if (!confident || typeof value !== "string") {
      throwMaybeAstError(
        `the arguments to ${functionName} were not all string literals`
      );
    }
    strings.push(value);
  }
  return strings;
}

interface Options {
  expectedValueAsIR: boolean;
  circularRefs: boolean;
}

export function getOptions(
  validatorType: "detailed" | "boolean",
  macroPath: NodePath<t.Node>,
  functionName: string
): Options {
  const keys = { c: "circularRefs", e: "expectedValueAsIR" } as const;
  const callExpr = macroPath.parentPath;
  assertCallExpr(callExpr);
  const args = callExpr.get("arguments");
  assertArray(args);
  if (args.length === 0) {
    return { [keys.c]: true, [keys.e]: false };
  }
  const notOptionsObjectMessage = `${functionName}'s sole argument is an options object that is statically known at COMPILE TIME.`;
  if (args.length > 1) {
    throw new MacroError(notOptionsObjectMessage);
  } else {
    const arg = args[0];
    const { confident, value } = arg.evaluate();
    if (!confident || typeof value !== "object") {
      throw new MacroError(notOptionsObjectMessage);
    }
    const opts: Options = { [keys.c]: true, [keys.e]: false };
    const t1 = typeof value[keys.c];
    if (t1 !== "boolean" && t1 !== "undefined") {
      throw new MacroError(
        `options.${keys.c} should be a boolean but it was: ${t1}`
      );
    }
    opts[keys.c] = !!value[keys.c];
    if (validatorType === "detailed") {
      const t2 = typeof value[keys.e];
      if (t2 !== "boolean" && t2 !== "undefined") {
        throw new MacroError(
          `options.${keys.e} should be a boolean but it was: ${t2}`
        );
      }
      opts[keys.c] = !!value[keys.e];
    }
    return opts;
  }
}

function assertSingular<T>(
  expr: NodePath<T>[] | NodePath<T>
): asserts expr is NodePath<T> {
  if (expr === null || expr === undefined || Array.isArray(expr)) {
    throw new MacroError(
      Errors.UnexpectedError(
        `expected expr to be single NodePath but it was ${expr}`
      )
    );
  }
}

function assertArray<T>(
  expr: NodePath<T>[] | NodePath<T>
): asserts expr is NodePath<T>[] {
  if (expr === null || expr === undefined || !Array.isArray(expr)) {
    throwUnexpectedError(
      `Expected expression to be array, but it was ${JSON.stringify(expr)}`
    );
  }
}

export function getTypeDeclarationInBlock(
  typeName: string,
  stmts: t.Statement[],
  idxInBlock?: number
): t.TSInterfaceDeclaration | t.TSTypeAliasDeclaration | null {
  for (let i = 0; i < stmts.length; ++i) {
    if (i === idxInBlock) continue;
    const stmt = stmts[i];
    if (t.isTSInterfaceDeclaration(stmt) || t.isTSTypeAliasDeclaration(stmt)) {
      const declarationName = stmt.id.name;
      if (declarationName === typeName) {
        return stmt;
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
    throwUnexpectedError(
      `evaluation result had type ${typeof typeName} and confidence ${confident}`
    );
  }
  return typeName;
}

export function getBlockParent(macroPath: NodePath<t.Node>): t.Statement[] {
  const callExpr = macroPath.parentPath;
  assertCallExpr(callExpr);
  const exprStmt = callExpr.parentPath;
  if (!exprStmt.isExpressionStatement())
    throw new MacroError(Errors.InvalidRegisterCall());

  const { node } = exprStmt.parentPath;
  if (!t.isProgram(node) && !t.isBlock(node)) {
    throw new MacroError(Errors.InvalidRegisterCall());
  } else {
    return node.body;
  }
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
