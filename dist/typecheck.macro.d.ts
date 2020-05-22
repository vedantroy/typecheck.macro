export default function createValidator<T>(): (value: unknown) => value is T;
export function register(typeName: string): () => void;

export const __dumpAfterRegistration: Map<string, internal.IR>
export function __dumpAfterTypeResolution(...typeNames: string[]): Map<string, internal.IR>
export function __dumpAfterTypeFlattening(...typeNames: string[]): Map<string, internal.IR>
export function __dumpInstantiatedIR<T>(): Map<string, internal.IR>

declare namespace internal {
  export type Tag =
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
  export const arrayTypeNames: readonly ["Array", "ReadonlyArray"];
  export interface ArrayType extends IR {
    type: "arrayType";
    elementType: IR;
  }
  export interface GenericType extends IR {
    type: "genericType";
    typeParameterIndex: number;
  }
  export const primitiveTypes: readonly [
    "number",
    "bigInt",
    "string",
    "boolean",
    "null",
    "object",
    "any",
    "undefined",
    "unknown"
  ];
  export type PrimitiveTypeName = typeof primitiveTypes[number];
  export interface PrimitiveType extends IR {
    type: "primitiveType";
    typeName: PrimitiveTypeName;
  }
  export interface Literal extends IR {
    type: "literal";
    value: string | number | boolean;
  }
  export interface Union extends IR {
    type: "union";
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
    restType?: ArrayType | ArrayType;
  }
  const indexSignatureKeyTypes: readonly ["string", "number"];
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
  }
  export interface PropertySignature extends IR {
    type: "propertySignature";
    keyName: string | number;
    optional: boolean;
    value: IR;
  }
}
