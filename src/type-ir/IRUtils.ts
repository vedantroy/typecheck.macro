import {
  Union,
  Intersection,
  IR,
  Literal,
  primitiveTypes,
  PrimitiveTypeName,
  PrimitiveType,
  Type,
} from "./IR";
import { throwUnexpectedError } from "../macro-assertions";
import { hasAtLeast1Element } from "../utils/checks";

export function Union(...childTypes: [IR, IR, ...IR[]]): Union {
  const union: Union = {
    type: "union",
    childTypes,
  };
  return union;
}

export function Intersection(...childTypes: [IR, IR, ...IR[]]): Intersection {
  const intersection: Intersection = {
    type: "intersection",
    childTypes,
  };
  return intersection;
}

export function Literal(value: string | number | boolean): Literal {
  const literal: Literal = {
    type: "literal",
    value,
  };
  return literal;
}

function assertPrimitiveType(type: string): asserts type is PrimitiveTypeName {
  if (!primitiveTypes.includes(type as PrimitiveTypeName)) {
    throwUnexpectedError(`${type} is not a builtin type`);
  }
}

export function PrimitiveType(typeName: string): PrimitiveType {
  assertPrimitiveType(typeName);
  const primitive: PrimitiveType = {
    type: "primitiveType",
    typeName,
  };
  return primitive;
}

export function Type(typeName: string, ...typeParameters: IR[]): Type {
  if (hasAtLeast1Element(typeParameters)) {
    const type: Type = { type: "type", typeName, typeParameters };
    return type;
  }
  const type: Type = { type: "type", typeName };
  return type;
}
