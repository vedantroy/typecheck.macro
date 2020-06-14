/**
 *  This file contains compile time helpers to validate that the macro is being called appropriately.
 */
import { NodePath, types as t, transformSync } from "@babel/core";
import { MacroError } from "babel-plugin-macros";
import { oneLine, stripIndent } from "common-tags";
import { Tag } from "./type-ir/IR";
import _ from "lodash";

// This is used in order to reduce duplication in the compile error tests
// If you update a message in here, the corresponding compile error test will pass automatically.
// No updating needed.
export const ErrorBase = {
  ValidatorNoTypeParameter: `Failed to find type parameter. createValidator should be called with a type parameter. Example: "createValidator<TypeName>()"`,
  NotCalledAsFunction: `Macro should be called as function but was called as a`,
  MoreThanOneTypeParameter: `Macro should be called with at most 2 type parameters but was called with`,
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
  MoreThanTwoTypeParameters: (typeParams: number) =>
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

export type ExpectedValueFormat = typeof expectedValueFormats[number];
interface Options {
  expectedValueFormat: ExpectedValueFormat;
  circularRefs: boolean;
  allowForeignKeys: boolean;
}

// Keep this in sync with dist/typecheck.macro.d.ts
const transformerKeys = {
  c: "constraints",
  t: "transformers",
} as const;
export type UserFuncMap = Map<string | number, string>;
export interface UserFunctions {
  [transformerKeys.c]: UserFuncMap;
  [transformerKeys.t]: UserFuncMap;
  forbiddenVarNames: Set<string>;
}

// Keep this in sync with dist/typecheck.macro.d.ts
const keys = {
  c: "circularRefs",
  f: "allowForeignKeys",
  e: "expectedValueFormat",
} as const;

const expectedValueFormats = ["human-friendly", "type-ir"] as const;
const defaultOpts = {
  [keys.c]: true,
  [keys.f]: true,
  [keys.e]: expectedValueFormats[0],
};
Object.freeze(defaultOpts);

type ValidatorType = "boolean" | "detailed";
export function getArgs(
  validatorType: ValidatorType,
  macroPath: NodePath<t.Node>,
  functionName: string,
  fileText: string,
  fileName: string
): [Options, UserFunctions] {
  const callExpr = macroPath.parentPath;
  assertCallExpr(callExpr);
  const args = callExpr.get("arguments");
  assertArray(args);
  const defaultTransformers: UserFunctions = {
    [transformerKeys.c]: new Map(),
    [transformerKeys.t]: new Map(),
    forbiddenVarNames: new Set(),
  };
  if (args.length === 0) {
    return [defaultOpts, defaultTransformers];
  } else if (args.length === 1) {
    return [
      getOptionsArg(args[0], validatorType, functionName),
      defaultTransformers,
    ];
  } else if (args.length === 2) {
    return [
      getOptionsArg(args[0], validatorType, functionName),
      getUserFuncArg(args[1], functionName, fileText, fileName),
    ];
  } else {
    throw new MacroError(
      `Recieved ${args.length} arguments, although ${functionName} accepts a max of 2 arguments.`
    );
  }
}

export function getOptionsArg(
  path: NodePath<t.Node>,
  validatorType: ValidatorType,
  functionName: string
): Options {
  const { confident, value } = path.evaluate();
  if (!confident) {
    throw new MacroError(
      `${functionName}'s first argument is 1. an options object that is statically known at compile time or 2. undefined`
    );
  }
  if (value === undefined) return defaultOpts;
  const opts: Options = {
    [keys.f]: _.get(value, keys.f, defaultOpts[keys.f]),
    [keys.e]:
      validatorType === "detailed"
        ? _.get(value, keys.e, defaultOpts[keys.e])
        : expectedValueFormats[0],
    [keys.c]: _.get(value, keys.c, defaultOpts[keys.c]),
  };
  const checkType = (type: string, key: keyof typeof opts) => {
    if (typeof opts[key] !== type) {
      throw new MacroError(
        `key: ${key} in the options object must be undefined or a ${type}`
      );
    }
  };
  const booleanType = "boolean";
  checkType(booleanType, keys.f);
  checkType(booleanType, keys.c);
  checkType("string", keys.e);
  if (!expectedValueFormats.includes(opts[keys.e])) {
    throw new MacroError(
      `expected value format must be one of: ${JSON.stringify(
        expectedValueFormats
      )}`
    );
  }
  return opts;
}

export function getUserFuncArg(
  path: NodePath<t.Node>,
  functionName: string,
  fileText: string,
  filename: string
): UserFunctions {
  if (!t.isObjectExpression(path)) {
    throw new MacroError(
      `${functionName}'s second argument must be an object expression`
    );
  }
  const props = path.get("properties");
  assertArray(props);

  const getChild = (
    key: string
  ): Array<NodePath<t.ObjectMethod | t.ObjectProperty | t.SpreadElement>> => {
    const prop = _.find(
      props,
      (x) => t.isObjectProperty(x) && _.get(x, "node.key.name", null) === key
    );
    if (prop !== undefined) {
      const value = prop.get("value");
      assertSingular(value);
      if (!t.isObjectExpression(value)) {
        throw new MacroError(
          `key: "${key}" of ${functionName}'s second argument must be a object expression`
        );
      }
      return value.get("properties") as ReturnType<typeof getChild>;
    }
    return [];
  };
  const constraintMap: UserFuncMap = new Map();
  const transformerMap: UserFuncMap = new Map();
  const forbiddenVarNames = new Set<string>();
  const transformers: UserFunctions = {
    [transformerKeys.c]: constraintMap,
    [transformerKeys.t]: transformerMap,
    forbiddenVarNames,
  };
  getFunctionsFromArg(
    getChild(transformerKeys.c),
    constraintMap,
    forbiddenVarNames,
    { functionName, fileText, filename }
  );
  getFunctionsFromArg(
    getChild(transformerKeys.t),
    transformerMap,
    forbiddenVarNames,
    { functionName, fileText, filename }
  );
  debugger;
  return transformers;
}

function getFunctionsFromArg(
  arg: NodePath<t.ObjectMethod | t.ObjectProperty | t.SpreadElement>[],
  funcMap: UserFuncMap,
  reservedVars: Set<string>,
  {
    functionName,
    fileText,
    filename,
  }: { functionName: string; fileText: string; filename: string }
): void {
  for (const prop of arg) {
    if (!t.isObjectProperty(prop)) {
      throw new MacroError(
        `${functionName}'s second argument must be an object expression composed of key-value pairs, where the keys are statically known (not computed)`
      );
    }
    const typeName = _.get(prop, "node.key.name", null);
    if (typeName === null) {
      throw new MacroError(
        `Failed to get key name when parsing 2nd parameter of ${functionName}`
      );
    }
    if (typeof typeName !== "string" && typeof typeName !== "number") {
      throw new MacroError(
        `Expected ${JSON.stringify(typeName)} to be string or number`
      );
    }
    const valuePath = prop.get("value");
    assertSingular(valuePath);
    const refinementValueError = new MacroError(
      `The values of the refinement object in the 2nd parameter of ${functionName} must be strings or function declarations`
    );
    if (
      t.isArrowFunctionExpression(valuePath) ||
      t.isFunctionExpression(valuePath)
    ) {
      const { start, end } = valuePath.node;
      if (start === null || end === null) {
        throw new MacroError(
          `Failed to extract function text from 2nd parameter of ${functionName}`
        );
      }
      valuePath.traverse({
        Identifier(path, _) {
          reservedVars.add(path.node.name);
        },
      });
      const functionText = "(" + fileText.slice(start, end) + ")";
      // compile the function in order to remove type annotations
      const result = transformSync(functionText, { filename });
      let code = result?.code;
      if (code === null || code === undefined) {
        throw new MacroError(
          `Failed to compile function pass as value of 2nd parameter of ${functionName}`
        );
      }
      code = code.replace(/^"use strict";\n*/, "");
      // parenthesis will be kept around function expressions and not around arrow functions
      // arrow functions will be ended with a semi-colon
      if (code.slice(-1) === ";") code = code.slice(0, -1);
      code = "(" + code + ")";
      funcMap.set(typeName, code);
    } else {
      throw refinementValueError;
    }
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
    let stmt = stmts[i];
    // If the statement is an export (named or default) use the declared statement instead
    if (
      t.isExportNamedDeclaration(stmt) ||
      t.isExportDefaultDeclaration(stmt)
    ) {
      stmt = stmt.declaration;
    }
    if (t.isTSInterfaceDeclaration(stmt) || t.isTSTypeAliasDeclaration(stmt)) {
      const declarationName = stmt.id.name;
      if (declarationName === typeName) {
        return stmt;
      }
    }
  }
  return null;
}

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
      if (params > 2)
        throw new MacroError(Errors.MoreThanTwoTypeParameters(params));
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
