import { types as t } from "@babel/core";
import { MacroError } from "babel-plugin-macros";
import {
  IR,
  Union,
  PropertySignature,
  IndexSignatureKeyType,
  ObjectPattern,
  PrimitiveTypeName,
  primitiveTypes,
  PrimitiveType,
  Interface,
  Type,
  GenericType,
  Literal,
  ArrayType,
  arrayTypeNames,
  Tuple,
} from "./typeIR";
import { throwUnexpectedError, throwMaybeAstError } from "../macro-assertions";

function hasAtLeast1Element<T>(array: T[]): array is [T, ...T[]] {
  return array.length >= 1;
}

function hasAtLeast2Elements<T>(array: T[]): array is [T, T, ...T[]] {
  return array.length >= 2;
}

/*
function isArrayType(type: IR): type is ArrayType {
  return (
    type.type === "type" &&
    arrayTypeNames.includes((type as Type).typeName as ArrayTypeName)
  );
}
*/

/*
function assertArrayLikeType(
  type: IR
): asserts type is ArrayType | ArrayType {
  const isArrayLike = type.type === "arrayLiteral" || isArrayType(type);
  if (!isArrayLike) {
    throwMaybeAstError(`type had tag ${type.type} and typeName: ${(type as Type).typeName} instead of being a ArrayLikeType`);
  }
}
*/

function assertArrayType(node: IR): asserts node is ArrayType {
  if (node.type !== "arrayType") {
    throwUnexpectedError(`node had type: ${node.type} instead of arrayType`);
  }
}

function assertTypeAnnotation(
  node: t.TSTypeAnnotation | null
): asserts node is t.TSTypeAnnotation {
  if (node === null) {
    throwMaybeAstError(`type annotation was null`);
  }
}

// https://github.com/microsoft/TypeScript/issues/38447
function assertPrimitiveType(type: string): asserts type is PrimitiveTypeName {
  if (!primitiveTypes.includes(type as PrimitiveTypeName)) {
    throwUnexpectedError(`${type} is not a builtin type`);
  }
}

export interface IrGenState {
  externalTypes: Set<string>;
  readonly genericParameterNames: ReadonlyArray<string>;
}

// Interfaces need their own function to generate type IR because
// 1. interfaces declarations are top level (cannot be nested)
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
    body: getBodyIR(node.body.body, {
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
): ObjectPattern {
  // https://stackoverflow.com/questions/53276792/define-a-list-of-optional-keys-for-typescript-record
  type PartialRecord<K extends keyof any, T> = {
    [P in K]?: T;
  };
  const indexSignatures: PartialRecord<IndexSignatureKeyType, IR> = {};
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
        indexSignatures[keyType] = getTypeIR(
          element.typeAnnotation.typeAnnotation,
          state
        );
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
  const objectPattern: ObjectPattern = {
    type: "objectPattern",
    properties: propertySignatures,
    ...(n && { numberIndexerType: n }),
    ...(s && { stringIndexerType: s }),
  };
  return objectPattern;
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

export function getTypeIRForTypeParameter(node: t.TSType): IR {
  // Called from createValidator, at this point all type registering
  // has finished
  return getTypeIR(node, {
    externalTypes: new Set(), // registering of external types has finished
    genericParameterNames: [], // no generic parameters, like T, in a type instantion
  });
}

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
  } else if (t.isTSTupleType(node)) {
    let optionalIndex = -1;
    let restType: ArrayType | ArrayType | null = null;
    const children: IR[] = [];
    const { elementTypes } = node;
    const length = elementTypes.length;
    for (let i = 0; i < length; ++i) {
      const child = elementTypes[i];
      if (t.isTSOptionalType(child)) {
        if (optionalIndex === -1) optionalIndex = i;
        children.push(getTypeIR(child.typeAnnotation, state));
      } else if (t.isTSRestType(child)) {
        if (i !== length - 1) {
          throwMaybeAstError(
            `rest element was not last type in tuple type because it had index ${i}`
          );
        }
        const ir = getTypeIR(child.typeAnnotation, state);
        assertArrayType(ir);
        restType = ir;
      } else {
        children.push(getTypeIR(child, state));
      }
    }
    const tuple: Tuple = {
      type: "tuple",
      childTypes: children,
      optionalIndex: optionalIndex === -1 ? length : optionalIndex,
      ...(restType && { restType }),
    };
    return tuple;
  } else if (t.isTSArrayType(node)) {
    const arrayLiteralType: ArrayType = {
      type: "arrayType",
      elementType: getTypeIR(node.elementType, state),
    };
    return arrayLiteralType;
  } else if (t.isTSTypeLiteral(node)) {
    // We don't need to worry that the object pattern has references to a generic parameter
    // because this is only possible if it belongs to an interface
    return getBodyIR(node.members, state);
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
    // convert Array and ReadonlyArray to array literal types
    // we don't lose information doing this because ReadonlyArray
    // is indistinguishable from Array at runtime
    if (arrayTypeNames.includes(typeName)) {
      if (genericParameters.length !== 1) {
        throwMaybeAstError(
          `type ${typeName} has 1 generic parameter but found ${genericParameters.length}`
        );
      }
      const array: ArrayType = {
        type: "arrayType",
        elementType: genericParameters[0],
      };
      return array;
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
    assertPrimitiveType(builtinTypeName);
    const builtinType: PrimitiveType = {
      type: "primitiveType",
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
