import { MacroError } from "babel-plugin-macros";
import { Errors, throwUnexpectedError } from "../../macro-assertions";
import {
  IR,
  Interface,
  TypeAlias,
  Type,
  BuiltinType,
  BuiltinTypeName,
  GenericType,
  LiteralValue,
  Literal,
} from "../IR";
import deepCopy from "fast-copy";
import { deterministicStringify } from "../../utils/stringify";
import {
  isGenericType,
  isTypeAlias,
  isBuiltinType,
  isTuple,
  isPrimitive,
  isLiteral,
} from "../IRUtils";
import * as u from "../IRUtils";
import { TypeInfo } from "./instantiate";

/**
 * Replace all objects that in ir that match
 * shouldProcess with the result of calling process
 * on them. Returns a copy.
 */
export function traverse<T>(
  ir: Readonly<IR>,
  shouldProcess: (obj: unknown) => obj is T,
  process: (obj: T) => IR
): IR {
  function helper(current: IR) {
    for (const [k, v] of Object.entries(current)) {
      if (typeof v !== "object" || v === null) continue;
      if (shouldProcess(v)) {
        // @ts-ignore
        current[k] = process(v);
      } else if (Array.isArray(v)) {
        for (let i = 0; i < v.length; ++i) {
          const element = v[i];
          if (shouldProcess(element)) {
            v[i] = process(element);
          } else helper(element);
        }
      } else helper(v);
    }
  }
  const copy = deepCopy(ir);
  if (shouldProcess(copy)) {
    return process(copy);
  }
  helper(copy);
  return copy;
}

function replaceTypeParameters(
  ir: IR,
  resolvedParameterValues: IR[],
  currentTypeParameterIndex: number = resolvedParameterValues.length
): IR {
  return traverse<GenericType>(ir, isGenericType, (typeParameterRef) => {
    const { typeParameterIndex } = typeParameterRef;
    if (typeParameterIndex >= currentTypeParameterIndex) {
      // TODO: Right now this error isn't thrown in Foo<X = Z, Z> {}
      // because Z wil be parsed as a type reference instead of a type parameter
      throw new MacroError(
        Errors.InvalidTypeParameterReference(
          currentTypeParameterIndex,
          typeParameterIndex
        )
      );
    }
    return resolvedParameterValues[typeParameterIndex];
  });
}

export function applyTypeParameters(
  target: Interface | TypeAlias | BuiltinType<BuiltinTypeName>,
  typeName: string,
  providedTypeParameters: IR[]
): IR {
  const { typeParameterDefaults, typeParametersLength } = target;
  if (typeParametersLength < providedTypeParameters.length) {
    throw new MacroError(
      Errors.TooManyTypeParameters(
        typeName,
        providedTypeParameters.length,
        typeParametersLength
      )
    );
  }

  const requiredTypeParameters =
    typeParametersLength - typeParameterDefaults.length;
  if (requiredTypeParameters > providedTypeParameters.length) {
    throw new MacroError(
      Errors.NotEnoughTypeParameters(
        typeName,
        providedTypeParameters.length,
        requiredTypeParameters
      )
    );
  }

  const resolvedParameterValues: IR[] = providedTypeParameters;
  for (let i = providedTypeParameters.length; i < typeParametersLength; ++i) {
    const instantiatedDefaultValue = replaceTypeParameters(
      typeParameterDefaults[i - requiredTypeParameters],
      resolvedParameterValues,
      i
    );
    resolvedParameterValues.push(instantiatedDefaultValue);
  }

  return replaceTypeParameters(
    isTypeAlias(target)
      ? target.value
      : isBuiltinType(target)
      ? target
      : target.body,
    resolvedParameterValues
  );
}

export function getTypeKey(type: Type | Literal): string {
  if (u.isType(type)) {
    const { typeName, typeParameters = [] } = type;
    if (typeParameters.length === 0) return typeName;
    return typeName + deterministicStringify(typeParameters);
  } else {
    const { value } = type;
    return `LITERAL?#$<>-${JSON.stringify(value)}`;
  }
}

export type DisjointType =
  | BuiltinTypeName
  | "number"
  | "string"
  | "boolean"
  | "null"
  | "undefined"
  | "object";

export interface HierarchyInfo {
  isAnything?: true;
  disjointType?: DisjointType;
  literalValue?: LiteralValue;
}

export function getTypeInfo(ir: IR): HierarchyInfo {
  const { type } = ir;
  // TODO: Refactor this switch stmt
  switch (type) {
    case "instantiatedType":
      throwUnexpectedError(
        `did not expect ${type}, it have been retrieved before calling this method`
      );
    case "type":
    case "genericType":
      throwUnexpectedError(
        `did not expect ${type}, it should have been removed during the instantiation pass`
      );
    case "union":
    case "intersection":
      throwUnexpectedError(
        `did not expect ${type}, it should have been removed during the flattening pass`
      );
    case "interface":
    case "alias":
      throwUnexpectedError(
        `did not expect ${type}, it should only appear as a top level declaration`
      );
    case "propertySignature":
      throwUnexpectedError(
        `did not expect ${type}, it should only appear inside an object pattern`
      );
    default:
      if (isBuiltinType(ir)) {
        const { typeName } = ir;
        return { disjointType: typeName };
      }
      if (isTuple(ir)) {
        return { disjointType: "Array" };
      }
      if (isPrimitive(ir)) {
        switch (ir.typeName) {
          case "bigInt":
            throw new MacroError(
              "bigInts are not supported yet. Contact the developer if you want to increase their priority."
            );
          case "any":
          case "unknown":
            return { isAnything: true };
          default:
            return { disjointType: ir.typeName };
        }
      }
      if (isLiteral(ir)) {
        const literalType = typeof ir.value;
        switch (literalType) {
          case "boolean":
          case "number":
          case "string":
            return { disjointType: literalType, literalValue: ir.value };
          case "bigint":
          case "symbol":
            throw new MacroError(
              `${literalType}s are not supported yet. Contact the developer if you want to increase their priority`
            );
          default:
            throwUnexpectedError(
              `unexpected literal type: ${literalType} for value ${ir.value}`
            );
        }
      }
      if (u.isObjectPattern(ir)) {
        return { disjointType: "object" };
      }
      throwUnexpectedError(
        `Failed to get hierarchy info for: ${JSON.stringify(ir, null, 2)}`
      );
  }
}

export function getInstantiatedType(
  typeName: string,
  instantiatedTypes: Map<string, TypeInfo>
): IR {
  const instantiated = instantiatedTypes.get(typeName);
  if (instantiated === undefined) {
    throwUnexpectedError(`failed to retrieve instantiated type: ${typeName}`);
  }
  return instantiated.value;
}
