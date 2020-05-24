import { MacroError } from "babel-plugin-macros";
import { Errors } from "../../macro-assertions";
import {
  IR,
  Interface,
  TypeAlias,
  Type,
  BuiltinType,
  BuiltinTypeName,
  GenericType,
} from "../IR";
import deepCopy from "fast-copy";
import { deterministicStringify } from "../../utils/stringify";
import { isGenericType, isTypeAlias, isBuiltinType } from "../IRUtils";

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

export function getTypeKey(type: Type): string {
  const { typeName, typeParameters = [] } = type;
  if (typeParameters.length === 0) return typeName;
  return typeName + deterministicStringify(typeParameters);
}
