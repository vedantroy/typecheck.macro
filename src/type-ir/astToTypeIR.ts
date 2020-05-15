import { types as t } from "@babel/core";
import { MacroError } from "babel-plugin-macros";
import {
  IR,
  Union,
  PropertySignature,
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
  IndexSignatureKeyType,
  TypeAlias,
} from "./typeIR";
import { throwUnexpectedError, throwMaybeAstError } from "../macro-assertions";

function hasAtLeast1Element<T>(array: T[]): array is [T, ...T[]] {
  return array.length >= 1;
}

function hasAtLeast2Elements<T>(array: T[]): array is [T, T, ...T[]] {
  return array.length >= 2;
}

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
  readonly typeParameterNames: ReadonlyArray<string>;
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

// Interfaces and type aliases need their own functions to generate IR because
// 1. they are top level (cannot be nested)
// 2. they can have type parameters
export function getInterfaceIR(
  node: t.TSInterfaceDeclaration,
  externalTypes: Set<string>
): Interface {
  const typeParameterInfo = processGenericTypeParameters(
    node.typeParameters,
    externalTypes
  );
  const interface_: Interface = {
    type: "interface",
    ...typeParameterInfo,
    body: getBodyIR(node.body.body, {
      externalTypes,
      typeParameterNames: typeParameterInfo.typeParameterNames,
    }),
  };
  return interface_;
}

// This function seems like a duplicate of the interface function
// but separation is good in case we implement "extends" in the future
export function getTypeAliasIR(
  node: t.TSTypeAliasDeclaration,
  externalTypes: Set<string>
): TypeAlias {
  const typeParameterInfo = processGenericTypeParameters(
    node.typeParameters,
    externalTypes
  );
  const alias: TypeAlias = {
    type: "alias",
    ...typeParameterInfo,
    value: getIR(node.typeAnnotation, {
      externalTypes,
      typeParameterNames: typeParameterInfo.typeParameterNames,
    }),
  };
  return alias;
}

function processGenericTypeParameters(
  node: t.TSTypeParameterDeclaration | null | undefined,
  externalTypes: Set<string>
) {
  const typeParameterNames: string[] = [];
  const typeParameterDefaults: IR[] = [];
  const typeParameterInfo = { typeParameterNames, typeParameterDefaults };
  if (node === undefined || node === null) {
    return { ...typeParameterInfo, typeParametersLength: 0 };
  }
  for (const param of node.params) {
    // we don't handle type constraints because
    // the macro is not a type checker
    if (param.default) {
      typeParameterDefaults.push(
        getIR(param.default, {
          externalTypes,
          typeParameterNames,
        })
      );
    }
    typeParameterNames.push(param.name);
  }
  return {
    ...typeParameterInfo,
    typeParametersLength: typeParameterNames.length,
  };
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
        indexSignatures[keyType] = getIR(
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
            value: getIR(element.typeAnnotation.typeAnnotation, state),
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

export function getTypeParameterIR(node: t.TSType): IR {
  // Called from createValidator, at this point all type registering has finished
  return getIR(node, {
    // registering of external types has finished
    externalTypes: new Set(),
    // no generic parameters, like T, in a type instantion
    // createValidator<Foo<T>>() is incoherent
    typeParameterNames: [],
  });
}

export default function getIR(node: t.TSType, state: IrGenState): IR {
  if (t.isTSUnionType(node)) {
    const children: IR[] = [];
    for (const childType of node.types) {
      children.push(getIR(childType, state));
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
    let firstOptionalIndex = -1;
    let restType: ArrayType | ArrayType | null = null;
    const children: IR[] = [];
    const { elementTypes } = node;
    const length = elementTypes.length;
    for (let i = 0; i < length; ++i) {
      const child = elementTypes[i];
      if (t.isTSOptionalType(child)) {
        if (firstOptionalIndex === -1) firstOptionalIndex = i;
        children.push(getIR(child.typeAnnotation, state));
      } else if (t.isTSRestType(child)) {
        if (i !== length - 1) {
          throwMaybeAstError(
            `rest element was not last type in tuple type because it had index ${i}`
          );
        }
        const ir = getIR(child.typeAnnotation, state);
        assertArrayType(ir);
        restType = ir;
      } else {
        children.push(getIR(child, state));
      }
    }
    if (firstOptionalIndex === -1) firstOptionalIndex = length;
    const tuple: Tuple = {
      type: "tuple",
      childTypes: children,
      firstOptionalIndex,
      ...(restType && { restType }),
    };
    return tuple;
  } else if (t.isTSArrayType(node)) {
    const arrayLiteralType: ArrayType = {
      type: "arrayType",
      elementType: getIR(node.elementType, state),
    };
    return arrayLiteralType;
  } else if (t.isTSTypeLiteral(node)) {
    // We don't need to worry that the object pattern has references to a generic parameter
    // because this is only possible if it belongs to an interface
    return getBodyIR(node.members, state);
  } else if (t.isTSTypeReference(node)) {
    const typeParameters: IR[] = [];
    if (node.typeParameters) {
      for (const param of node.typeParameters.params) {
        typeParameters.push(getIR(param, state));
      }
    }
    if (t.isTSQualifiedName(node.typeName)) {
      // TODO: When does a TSQualifiedName pop-up?
      throwUnexpectedError(
        `typeName was a TSQualifiedName instead of Identifier.`
      );
    }
    const { typeParameterNames, externalTypes } = state;
    const typeName = node.typeName.name;
    const idx = typeParameterNames.indexOf(typeName);
    if (idx !== -1) {
      if (typeParameters.length > 0) {
        throwMaybeAstError(`Generic parameter ${typeName} had type arguments`);
      }
      const genericType: GenericType = {
        type: "genericType",
        typeParameterIndex: idx,
      };
      return genericType;
    }
    // convert Array and ReadonlyArray to array literal types
    // we don't lose information doing this because ReadonlyArray
    // is indistinguishable from Array at runtime
    if (arrayTypeNames.includes(typeName)) {
      if (typeParameters.length !== 1) {
        throwMaybeAstError(
          `type ${typeName} has 1 generic parameter but found ${typeParameters.length}`
        );
      }
      const array: ArrayType = {
        type: "arrayType",
        elementType: typeParameters[0],
      };
      return array;
    }
    // It's only an external type if it's not referencing
    // a generic parameter to the parent interface
    externalTypes.add(typeName);
    const withoutTypeParameters: Type = {
      type: "type",
      typeName: node.typeName.name,
    };
    if (hasAtLeast1Element(typeParameters)) {
      const type: Type = {
        ...withoutTypeParameters,
        typeParameters,
      };
      return type;
    }
    return withoutTypeParameters;
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
