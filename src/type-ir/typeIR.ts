type Tag =
  | "literal"
  | "reference"
  | "objectPattern"
  | "interface"
  | "union"
  | "indexSignature"
  | "propertySignature"
  | "builtinType"
  | "type"
  | "genericType";

export interface IR {
  type: Tag;
}

export interface Type extends IR {
  type: "type";
  typeName: string;
  genericParameters?: [IR, ...IR[]];
}

export interface GenericType extends IR {
  type: "genericType";
  genericParameterIndex: number;
}

export const builtinTypes = [
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

export type BuiltinTypeName = typeof builtinTypes[number];

export interface BuiltinType extends IR {
  type: "builtinType";
  typeName: BuiltinTypeName;
}

export interface Literal extends IR {
  type: "literal";
  value: string | number | boolean; // TODO: add bigint support
}

/*
// undefined can't be represented in JSON so the simple type
// {type: 'literal', value: <literal value>} is not possible
type LiteralType = "number" | "string" | "undefined" | "null";
export interface StringLiteral extends Literal {
  literalType: "string";
  value: string;
}

export interface NumberLiteral extends Literal {
  literalType: "number";
  value: number;
}
*/

export interface Union extends IR {
  type: "union";
  childTypes: [IR, IR, ...IR[]];
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
  numberIndexer?: IndexSignature;
  stringIndexer?: IndexSignature;
  properties: PropertySignature[];
}

export interface Interface extends IR {
  type: "interface";
  // Since generics are accessed by numerical index
  // this doesn't contain useful information
  genericParameterNames: string[];
  genericParameterDefaults: Array<IR | null>;
  numberIndexer?: IndexSignature;
  stringIndexer?: IndexSignature;
  properties: PropertySignature[];
}

// TODO: Might just be able to inline the type
const indexSignatureKeyTypes = ["string", "number"] as const;
export type IndexSignatureKeyType = typeof indexSignatureKeyTypes[number];

export interface IndexSignature extends IR {
  type: "indexSignature";
  // name doesn't matter in index signatures
  keyType: IndexSignatureKeyType;
  value: IR;
}

export interface PropertySignature extends IR {
  type: "propertySignature";
  // keyName encodes both name and value (string or number)
  keyName: string | number;
  optional: boolean;
  value: IR;
}
