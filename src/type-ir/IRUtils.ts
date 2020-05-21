import { MacroError } from "babel-plugin-macros";
import type {
  Union as U,
  Intersection as I,
  IR,
  Literal as L,
  PrimitiveTypeName,
  PrimitiveType as P,
  Type as T,
  TypeAlias as TA,
  GenericType as G,
  Interface as IF,
} from "./IR";
import { primitiveTypes } from "./IR";
import { throwUnexpectedError, Errors } from "../macro-assertions";
import { hasAtLeast1Element } from "../utils/checks";

// These MUST be kept in sync with IR.ts
export const isType = (x: IR): x is T => x.type === "type";
export const isPrimitiveType = (x: IR): x is P => x.type === "primitiveType";
export const isInterface = (x: IR): x is I => x.type === "interface";
export const isTypeAlias = (x: IR): x is TA => x.type === "alias";
export const isGenericType = (x: IR): x is G => x.type === "genericType";
export const isUnion = (x: IR): x is U => x.type === "union";
export const isIntersection = (x: IR): x is I => x.type === "intersection";
export const isIntersectionOrUnion = (x: IR): x is I | U =>
  isIntersection(x) || isUnion(x);

export function assertInterfaceOrAlias(
  ir: IR,
  typeName: string
): asserts ir is IF | TA {
  if (!isInterface(ir) && !isTypeAlias(ir)) {
    throw new MacroError(
      Errors.TypeDoesNotAcceptGenericParameters(typeName, ir.type)
    );
  }
}

export function Union(...childTypes: [IR, IR, ...IR[]]): U {
  const union: U = {
    type: "union",
    childTypes,
  };
  return union;
}

export function Intersection(...childTypes: [IR, IR, ...IR[]]): I {
  const intersection: I = {
    type: "intersection",
    childTypes,
  };
  return intersection;
}

export function Literal(value: string | number | boolean): L {
  const literal: L = {
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

export function PrimitiveType(typeName: string): P {
  assertPrimitiveType(typeName);
  const primitive: P = {
    type: "primitiveType",
    typeName,
  };
  return primitive;
}

export function Type(typeName: string, ...typeParameters: IR[]): T {
  if (hasAtLeast1Element(typeParameters)) {
    const type: T = { type: "type", typeName, typeParameters };
    return type;
  }
  const type: T = { type: "type", typeName };
  return type;
}
