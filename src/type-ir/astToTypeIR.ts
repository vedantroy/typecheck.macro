import { types as t } from "@babel/core";
import { MacroError } from "babel-plugin-macros";
import {
  IR,
  Union,
  PropertySignature,
  IndexSignatureKeyType,
  IndexSignature,
  ObjectPattern,
  BuiltinTypeName,
  builtinTypes,
  BuiltinType,
  Interface,
  Type,
  GenericType,
  Literal,
} from "./typeIR";
import { Errors, createErrorThrower } from "../macro-assertions";

function hasAtLeast1Element<T>(array: T[]): array is [T, ...T[]] {
  return array.length >= 1;
}

function hasAtLeast2Elements<T>(array: T[]): array is [T, T, ...T[]] {
  return array.length >= 2;
}

// TODO: We need to get rid of the function name stuff
const throwMaybeAstError: (message: string) => never = createErrorThrower(
  getTypeIR.name,
  Errors.MaybeAstError
);

const throwUnexpectedError: (message: string) => never = createErrorThrower(
  getTypeIR.name,
  Errors.UnexpectedError
);

function assertTypeAnnotation(
  node: t.TSTypeAnnotation | null
): asserts node is t.TSTypeAnnotation {
  if (node === null) {
    throwMaybeAstError(`type annotation was null`);
  }
}

// https://github.com/microsoft/TypeScript/issues/38447
function assertBuiltinType(type: string): asserts type is BuiltinTypeName {
  if (!builtinTypes.includes(type as BuiltinTypeName)) {
    throwUnexpectedError(`${type} is not a builtin type`);
  }
}

export interface IrGenState {
  externalTypes: Set<string>;
  readonly genericParameterNames: ReadonlyArray<string>;
}

// Interfaces need their own function to generate type IR because
// 1. interfaces declarations (cannot be nested)
// 2. interfaces can have generics as type parameters and
// we need to recognize those in the interface body
export function getInterfaceIR(
  node: t.TSInterfaceDeclaration,
  externalTypes: Set<string>
): IR {
  const genericParameterNames: string[] = [];
  const genericParameterDefaults: Array<IR | null> = [];
  // Babel types say t.TSTypeParameterDeclaration | null, but it can also be undefined
  if (node.typeParameters !== undefined && node.typeParameters !== null) {
    for (const param of node.typeParameters.params) {
      // we don't handle type constraints because
      // the macro is not a type checker
      genericParameterNames.push(param.name);
      if (param.default) {
        genericParameterDefaults.push(
          getTypeIR(param.default, {
            externalTypes,
            genericParameterNames,
          })
        );
      } else {
        genericParameterDefaults.push(null);
      }
    }
  }
  const interface_: Interface = {
    type: "interface",
    genericParameterNames,
    genericParameterDefaults,
    ...getBodyIR(node.body.body, {
      externalTypes,
      genericParameterNames,
    }),
  };
  return interface_;
}

// parse the body of a Typescript interface or object pattern
function getBodyIR(
  elements: t.TSTypeElement[],
  state: IrGenState
): {
  properties: PropertySignature[];
  numberIndexer?: IndexSignature;
  stringIndexer?: IndexSignature;
} {
  // https://stackoverflow.com/questions/53276792/define-a-list-of-optional-keys-for-typescript-record
  type PartialRecord<K extends keyof any, T> = {
    [P in K]?: T;
  };
  const indexSignatures: PartialRecord<
    IndexSignatureKeyType,
    IndexSignature
  > = {};
  const propertySignatures: PropertySignature[] = [];
  for (const element of elements) {
    if (t.isTSIndexSignature(element)) {
      //                 ˅˅˅˅˅˅˅ is value type annotation (value)
      // {[key: string]: number}
      //   ˄˄˄˄˄˄˄˄˄˄˄˄  is key type annotation (key)
      // The only valid keys are "string" and "number" and
      // keys cannot be optional in index types and key names don't matter

      const keyTypeAnnotation = element.parameters[0]?.typeAnnotation;
      if (t.isTSTypeAnnotation(keyTypeAnnotation)) {
        const indexType = keyTypeAnnotation.typeAnnotation.type;
        let keyType: IndexSignatureKeyType;
        switch (indexType) {
          case "TSNumberKeyword":
            keyType = "number";
            break;
          case "TSStringKeyword":
            keyType = "string";
            break;
          default:
            throwMaybeAstError(
              `indexType had an unexpected value: ${indexType}`
            );
        }
        assertTypeAnnotation(element.typeAnnotation);
        indexSignatures[keyType] = {
          type: "indexSignature",
          keyType,
          value: getTypeIR(element.typeAnnotation.typeAnnotation, state),
        };
      } else {
        throwMaybeAstError(
          `keyTypeAnnotation had unexpected value: ${keyTypeAnnotation}`
        );
      }
    } else if (t.isTSPropertySignature(element)) {
      const { key } = element;
      if (
        t.isIdentifier(key) ||
        t.isStringLiteral(key) ||
        t.isNumericLiteral(key)
      ) {
        const keyName = t.isIdentifier(key) ? key.name : key.value;
        if (typeof keyName === "string" || typeof keyName === "number") {
          const optional = Boolean(element.optional);
          assertTypeAnnotation(element.typeAnnotation);
          propertySignatures.push({
            type: "propertySignature",
            keyName,
            optional,
            value: getTypeIR(element.typeAnnotation.typeAnnotation, state),
          });
        } else {
          throwMaybeAstError(
            `property signature key ${keyName} had unexpected type ${typeof keyName}`
          );
        }
      } else {
        throwMaybeAstError(
          `property signature had unexpected key type: ${key.type}`
        );
      }
    } else if (t.isTSMethodSignature(element)) {
      // TODO: Have switch that supports method signatures as functions (without type args)
      throw new MacroError(
        `Method signatures in interfaces and type literals are not supported`
      );
    } else {
      throwUnexpectedError(`unexpected signature type: ${element.type}`);
    }
  }
  const [n, s] = [indexSignatures.number, indexSignatures.string];
  return {
    properties: propertySignatures,
    ...(n && { numberIndexer: n }),
    ...(s && { stringIndexer: s }),
  };
}

/**
 * Code is written in a defensive style. Example:
 * if (cond) {
 *    return value
 * } else {
 *   throw Error(...)
 * }
 *
 * Here, the else statement is not needed, but we keep it.
 * Otherwise, we have the following scenario:
 * if (cond) {
 *    if (cond2) return value
 *    // whoops forgot to handle case when cond2 is false!
 * }
 * // now we falsely throw this error instead
 * throw Error(...)
 */

export default function getTypeIR(node: t.TSType, state: IrGenState): IR {
  if (t.isTSUnionType(node)) {
    const children: IR[] = [];
    for (const childType of node.types) {
      children.push(getTypeIR(childType, state));
    }
    if (hasAtLeast2Elements(children)) {
      // Have an unnecessary variable instead of return {...} as Union
      // because the latter gives worse type checking
      const union: Union = { type: "union", childTypes: children };
      return union;
    } else {
      throwMaybeAstError(
        `union type had ${children.length}, which is not possible`
      );
    }
  } else if (t.isTSTypeLiteral(node)) {
    // We don't need to worry that the object pattern has references to a generic parameter
    // because this is only possible if it belongs to an interface
    const objectPattern: ObjectPattern = {
      type: "objectPattern",
      ...getBodyIR(node.members, state),
    };
    return objectPattern;
  } else if (t.isTSTypeReference(node)) {
    const genericParameters: IR[] = [];
    if (node.typeParameters) {
      for (const param of node.typeParameters.params) {
        genericParameters.push(getTypeIR(param, state));
      }
    }
    if (t.isTSQualifiedName(node.typeName)) {
      // TODO: When does a TSQualifiedName pop-up?
      throwUnexpectedError(
        `typeName was a TSQualifiedName instead of Identifier.`
      );
    }
    const { genericParameterNames, externalTypes } = state;
    const typeName = node.typeName.name;
    const idx = genericParameterNames.indexOf(typeName);
    if (idx !== -1) {
      if (genericParameters.length > 0) {
        throwMaybeAstError(`Generic parameter ${typeName} had type arguments`);
      }
      const genericType: GenericType = {
        type: "genericType",
        genericParameterIndex: idx,
      };
      return genericType;
    }
    // It's only an external type if it's not referencing
    // a generic parameter to the parent interface
    externalTypes.add(typeName);
    const withoutGenericParameters: Type = {
      type: "type",
      typeName: node.typeName.name,
    };
    if (hasAtLeast1Element(genericParameters)) {
      const type: Type = {
        ...withoutGenericParameters,
        genericParameters,
      };
      return type;
    }
    return withoutGenericParameters;
  } else if (t.isTSLiteralType(node)) {
    const value = node.literal.value;
    const literal: Literal = {
      type: "literal",
      value,
    };
    return literal;
  } else if (
    t.isTSNumberKeyword(node) ||
    t.isTSBigIntKeyword(node) ||
    t.isTSStringKeyword(node) ||
    t.isTSBooleanKeyword(node) ||
    t.isTSObjectKeyword(node) ||
    t.isTSNullKeyword(node) ||
    t.isTSUndefinedKeyword(node) ||
    t.isTSAnyKeyword(node) ||
    t.isTSUnknownKeyword(node)
  ) {
    const { type } = node;
    // type is "TSNumberKeyword", "TSStringKeyword", etc.
    const builtinTypeName = type
      .slice("TS".length, -"Keyword".length)
      .toLowerCase();
    assertBuiltinType(builtinTypeName);
    const builtinType: BuiltinType = {
      type: "builtinType",
      typeName: builtinTypeName,
    };
    return builtinType;
  } else if (t.isTSIntersectionType(node) || t.isTSMappedType(node)) {
    throw new MacroError(
      `${node.type} types are not supported. File an issue with the developer if you want this.`
    );
  } else {
    throwUnexpectedError(`${node.type} was not expected`);
  }
}
