type Tag =
  | "literal"
  | "reference"
  | "objectPattern"
  | "union"
  | "propertySignature"
  | "primitiveType"
  | "type"
  | "genericType"
  | "arrayType"
  | "tuple"
  | TypeDeclarationType;

export interface IR {
  type: Tag;
}

export interface Type extends IR {
  type: "type";
  typeName: string;
  typeParameters?: [IR, ...IR[]];
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
  typeParameterIndex: number;
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
  firstOptionalIndex: number;
  childTypes: IR[];
  restType?: ArrayType | ArrayType;
}

const indexSignatureKeyTypes = ["string", "number"] as const;
export type IndexSignatureKeyType = typeof indexSignatureKeyTypes[number];

export interface ObjectPattern extends IR {
  type: "objectPattern";
  numberIndexerType?: IR;
  stringIndexerType?: IR;
  properties: PropertySignature[];
}

type TypeDeclarationType = "interface" | "alias";

interface NamedTypeDeclaration extends IR {
  type: TypeDeclarationType;
  // Since generics are accessed by numerical index
  // this is only useful for debugging
  typeParameterNames: string[];
  typeParametersLength: number;
  typeParameterDefaults: Array<IR>;
}

export interface TypeAlias extends NamedTypeDeclaration {
  type: "alias";
  value: IR;
}

export interface Interface extends NamedTypeDeclaration {
  type: "interface";
  body: ObjectPattern;
  // interfaces will eventually support extending stuff
}

export interface PropertySignature extends IR {
  type: "propertySignature";
  // keyName encodes both name and value (string or number)
  keyName: string | number;
  optional: boolean;
  value: IR;
}
