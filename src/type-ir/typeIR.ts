type Tag =
  | "literal"
  | "reference"
  | "objectPattern"
  | "union"
  | "indexSignature"
  | "propertySignature"
  | "type";

export interface IR {
  type: Tag;
}

// This abstraction won't last?
// well first, it doesn't support generics
export interface Reference extends IR {
  type: "reference";
  reference: Reference | Type;
}

export interface Type extends IR {
  type: "type";
  typeName: string;
}

export const builtinTypes = [
  "number",
  "string",
  "boolean",
  "null",
  "object",
  "any",
  "undefined",
  "unknown",
] as const;

export type BuiltinTypeName = typeof builtinTypes[number];

export interface BuiltinType extends Type {
  typeName: BuiltinTypeName;
}

export interface Literal extends IR {
  type: "literal";
  value: string | number;
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

export interface ObjectPattern extends IR {
  type: "objectPattern";
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
