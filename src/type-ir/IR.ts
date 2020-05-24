export type Tag =
  | "literal"
  | "objectPattern"
  | "intersection"
  | "union"
  | "propertySignature"
  | "builtinType"
  | "primitiveType"
  | "type"
  | "genericType"
  | "tuple"
  | TypeDeclarationType
  // these nodes are patched out later
  | "instantiatedType"
  | "failedIntersection";

export interface IR {
  type: Tag;
}

export interface Type extends IR {
  type: "type";
  typeName: string;
  typeParameters?: [IR, ...IR[]];
}

export interface ArrayType extends Type {
  type: "type";
  typeName: "Array";
  typeParameters: [IR];
}

export interface InstantiatedType extends IR {
  type: "instantiatedType";
  typeName: string;
}

export interface FailedIntersection extends IR {
  type: "failedIntersection";
}

export interface GenericType extends IR {
  type: "genericType";
  typeParameterIndex: number;
}

export type LiteralValue = string | number | boolean;

export interface Literal extends IR {
  type: "literal";
  value: LiteralValue;
}

export interface Union extends IR {
  type: "union";
  childTypes: [IR, IR, ...IR[]];
}

export interface Intersection extends IR {
  type: "intersection";
  childTypes: [IR, IR, ...IR[]];
}

export interface Tuple extends IR {
  type: "tuple";
  /**
   * Example: [number, number?, ...string[]]
   *                   ^^^^^^ = index 1 = firstOptionalIndex (fOI)
   * childTypes.length (cLen) = 2 (amount of non-rest types)
   * restType = ...string[]
   * If fOI = n, the tuple must have at minimum n elements
   * and at most cLen elements, unless there is a rest element,
   * in which case there is no upper bound
   *
   * fOI <= cLen. If the tuple has no optional elements, fOI = cLen
   */
  firstOptionalIndex: number;
  childTypes: IR[];
  restType?: IR;
}

export const builtinTypes = ["Array", "Map", "Set"] as const;
export type BuiltinTypeName = typeof builtinTypes[number];

export interface BuiltinType<T extends BuiltinTypeName> extends IR {
  type: "builtinType";
  typeName: T;
  elementTypes: T extends "Array" | "Set" ? [IR] : [IR, IR];
  typeParametersLength: T extends "Array" | "Set" ? 1 : 2;
  typeParameterDefaults: [];
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
