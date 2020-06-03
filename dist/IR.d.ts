export declare type Tag = "literal" | "objectPattern" | "intersection" | "union" | "propertySignature" | "builtinType" | "primitiveType" | "type" | "genericType" | "tuple" | TypeDeclarationType | "instantiatedType" | "failedIntersection";
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
export declare type LiteralValue = string | number | boolean;
export interface Literal extends IR {
    type: "literal";
    value: LiteralValue;
}
export interface Union extends IR {
    type: "union";
    childTypes: [IR, IR, ...IR[]];
    hasUndefined?: boolean;
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
    undefinedOptionals: boolean;
}
export declare const builtinTypes: readonly ["Array", "Map", "Set"];
export declare type BuiltinTypeName = typeof builtinTypes[number];
export interface BuiltinType<T extends BuiltinTypeName> extends IR {
    type: "builtinType";
    typeName: T;
    elementTypes: T extends "Array" | "Set" ? [IR] : [IR, IR];
    typeParametersLength: T extends "Array" | "Set" ? 1 : 2;
    typeParameterDefaults: [];
}
export declare const primitiveTypes: readonly ["number", "bigInt", "string", "boolean", "null", "object", "any", "undefined", "unknown"];
export declare type PrimitiveTypeName = typeof primitiveTypes[number];
export interface PrimitiveType extends IR {
    type: "primitiveType";
    typeName: PrimitiveTypeName;
}
declare const indexSignatureKeyTypes: readonly ["string", "number"];
export declare type IndexSignatureKeyType = typeof indexSignatureKeyTypes[number];
export interface ObjectPattern extends IR {
    type: "objectPattern";
    numberIndexerType?: IR;
    stringIndexerType?: IR;
    properties: PropertySignature[];
}
declare type TypeDeclarationType = "interface" | "alias";
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