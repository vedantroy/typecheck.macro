type Tag =
  | "literal"
  | "reference"
  | "objectPattern"
  | "interface"
  | "union"
  | "indexSignature"
  | "propertySignature"
  | "primitiveType"
  | "type"
  | "genericType"
  | "arrayType"
  | "tuple";

export interface IR {
  type: Tag;
}

export interface Type extends IR {
  type: "type";
  typeName: string;
  genericParameters?: [IR, ...IR[]];
}

export const arrayTypeNames = ["Array", "ReadonlyArray"] as const;

//export type ArrayTypeName = typeof arrayTypeNames[number];

/*
export interface ArrayType extends Type {
  type: "type";
  typeName: ArrayTypeName;
  genericParameters: [IR];
}
*/

export interface ArrayType extends IR {
  type: "arrayType";
  elementType: IR;
}

export interface GenericType extends IR {
  type: "genericType";
  genericParameterIndex: number;
}

export const primitiveTypes = [
  "number",
  "bigInt", // TODO: Check if this fits assertBuiltinType
  "string",
  "boolean",
  "null",
  "object",
  "any",
  "undefined",
  "unknown",
] as const;

export type PrimitiveTypeName = typeof primitiveTypes[number];

export interface PrimitiveType extends IR {
  type: "primitiveType";
  typeName: PrimitiveTypeName;
}

export interface Literal extends IR {
  type: "literal";
  value: string | number | boolean; // TODO: add bigint support
}

export interface Union extends IR {
  type: "union";
  childTypes: [IR, IR, ...IR[]];
}

export interface Tuple extends IR {
  type: "tuple";
  // everything type inclusive-and-after
  // this must be optional (excluding the
  // restType, which is never optional)
  optionalIndex: number;
  childTypes: IR[];
  restType?: ArrayType | ArrayType;
}

/**
 * Object patterns are like interfaces except they don't
 * have generic parameters. An object pattern may still have
 * type annotations that reference a generic parameter if and
 * only if the object pattern is in the type annotation of an
 * interface with a generic parameter.
 */
export interface ObjectPattern extends IR {
  type: "objectPattern";
  numberIndexerType?: IR;
  stringIndexerType?: IR;
  properties: PropertySignature[];
}

export interface Interface extends IR {
  type: "interface";
  // Since generics are accessed by numerical index
  // this is only useful for debugging
  genericParameterNames: string[];
  genericParameterDefaults: Array<IR | null>;
  body: ObjectPattern;
}

// TODO: Might just be able to inline the type
const indexSignatureKeyTypes = ["string", "number"] as const;
export type IndexSignatureKeyType = typeof indexSignatureKeyTypes[number];

/*
export interface IndexSignature extends IR {
  type: "indexSignature";
  // name doesn't matter in index signatures
  keyType: IndexSignatureKeyType;
  value: IR;
}
*/

export interface PropertySignature extends IR {
  type: "propertySignature";
  // keyName encodes both name and value (string or number)
  keyName: string | number;
  optional: boolean;
  value: IR;
}
