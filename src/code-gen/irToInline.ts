/**
 * Code style notes:
 * - xxxV = xxxValidator
 * - xxVxx = xxValidatorxx
 */

import {
  PrimitiveTypeName,
  IR,
  ObjectPattern,
  PrimitiveType,
  Type,
  Interface,
  GenericType,
  TypeAlias,
} from "../type-ir/typeIR";
import { MacroError } from "babel-plugin-macros";
import { Errors, throwUnexpectedError } from "../macro-assertions";
import { codeBlock, oneLine } from "common-tags";
import deepCopy from "fast-copy";
import deterministicStringify from "../utils/stringify";

enum Ast {
  NONE,
  INLINE,
  FUNCTION,
}

interface Validator<T extends Ast> {
  type: T;
  code: T extends Ast.NONE ? null : string;
}

const TEMPLATE_VAR = "$$x$$";

const primitives: ReadonlyMap<
  PrimitiveTypeName,
  Validator<Ast.NONE> | Validator<Ast.INLINE>
> = new Map([
  ["any", { type: Ast.NONE, code: null }],
  ["unknown", { type: Ast.NONE, code: null }],
  ["null", { type: Ast.INLINE, code: `${TEMPLATE_VAR} === null` }],
  ["undefined", { type: Ast.INLINE, code: `${TEMPLATE_VAR} === undefined` }],
  [
    "boolean",
    { type: Ast.INLINE, code: `typeof ${TEMPLATE_VAR} === "boolean"` },
  ],
  ["number", { type: Ast.INLINE, code: `typeof ${TEMPLATE_VAR} === "number"` }],
  ["string", { type: Ast.INLINE, code: `typeof ${TEMPLATE_VAR} === "string"` }],
]);

interface State {
  readonly namedTypes: Map<string, IR>;
  readonly referencedTypeNames: string[];
  // theoretically all anonymous validation functions
  // could use the same parameter "p", but we give them unique parameters
  // p0, p1, ... this prevents bugs from hiding due to shadowing
  // (we prefer an explicit crash in the validator, so the user of the library can report it)
  paramIdx: number;
}

export function generateValidator(ir: IR, namedTypes: Map<string, IR>): string {
  const state: State = { referencedTypeNames: [], paramIdx: 0, namedTypes };
  const validator = visitIR(ir, state);
  const { type } = validator;
  if (isNonEmptyValidator(validator)) {
    const { code } = validator;
    return type === Ast.FUNCTION
      ? code
      : wrapWithFunction(code, getParamName(0));
  }
  // If type is Ast.NONE then no validation needs to be done
  return `p => true`;
}

export function visitIR(ir: IR, state: State): Validator<Ast> {
  state.paramIdx += 1;
  let visitorFunction: (ir: IR, state: State) => Validator<Ast>;
  switch (ir.type) {
    case "primitiveType":
      visitorFunction = visitPrimitiveType;
      break;
    case "objectPattern":
      visitorFunction = visitObjectPattern;
      break;
    case "type":
      visitorFunction = visitType;
      break;
    default:
      throwUnexpectedError(`unexpected ir type: ${ir.type}`);
  }
  const validator = visitorFunction(ir, state);
  // Only functions have parameters
  if (validator.type !== Ast.FUNCTION) state.paramIdx -= 1;
  return visitorFunction(ir, state);
}

function isInterface(ir: IR): ir is Interface {
  return ir.type === "interface";
}

function isTypeAlias(ir: IR): ir is TypeAlias {
  return ir.type === "alias";
}

function acceptsTypeParameters(
  ir: IR,
  typeName: string
): asserts ir is Interface | TypeAlias {
  if (!isInterface(ir) && !isTypeAlias(ir)) {
    throw new MacroError(
      Errors.TypeDoesNotAcceptGenericParameters(typeName, ir.type)
    );
  }
}

function isIR(val: any): val is IR {
  return (
    Object.prototype.hasOwnProperty.call(val, "type") &&
    typeof val.type === "string"
  );
}

function isGenericType(val: any): val is GenericType {
  return isIR(val) && val.type === "genericType";
}

function replaceTypeParameters(
  ir: IR,
  replacer: (typeParameterIndex: number) => IR
): IR {
  function helper(current: IR): void {
    for (const [key, val] of Object.entries(current)) {
      if (isGenericType(val)) {
        // https://stackoverflow.com/questions/61807202/convince-typescript-that-object-has-key-from-object-entries-object-keys
        // @ts-ignore
        current[key] = replacer(val.typeParameterIndex);
      } else if (Array.isArray(val)) {
        for (let i = 0; i < val.length; ++i) {
          const element = val[i];
          if (isGenericType(element)) {
            val[i] = replacer(element.typeParameterIndex);
          } else if (isIR(element)) {
            helper(element);
          }
        }
      }
    }
  }
  const copy = deepCopy(ir);
  helper(copy);
  return copy;
}

// TODO: We can add 2nd level caching of the actual validation functions
function visitType(ir: Type, state: State): Validator<Ast> {
  const { namedTypes } = state;
  const { typeName, typeParameters: providedTypeParameters } = ir;
  const referencedIr = namedTypes.get(typeName);
  if (referencedIr === undefined) {
    throw new MacroError(Errors.UnregisteredType(typeName));
  }
  if (!providedTypeParameters) return visitIR(referencedIr, state);

  // TODO: This will never fail?
  acceptsTypeParameters(referencedIr, typeName);
  const key = typeName + deterministicStringify(providedTypeParameters);
  let instantiatedIr = namedTypes.get(key);
  if (instantiatedIr !== undefined) return visitIR(instantiatedIr, state);

  const { typeParameterDefaults, typeParametersLength } = referencedIr;
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
      typeParameterDefaults[i],
      (typeParameterIdx) => {
        if (typeParameterIdx >= i) {
          // TODO: This error will never occur because
          // Foo<X = Z, Z> is turned into type IR such that Z is assumed to be
          // an external class. This could be solved in astToTypeIR, but we're not
          // the Typescript compiler so it's low priority!
          throw new MacroError(
            Errors.InvalidTypeParameterReference(i, typeParameterIdx)
          );
        }
        return resolvedParameterValues[typeParameterIdx];
      }
    );
    resolvedParameterValues.push(instantiatedDefaultValue);
  }

  const uninstantiatedType = isTypeAlias(referencedIr)
    ? referencedIr.value
    : referencedIr.body;
  instantiatedIr = replaceTypeParameters(
    uninstantiatedType,
    (typeParameterIdx) => resolvedParameterValues[typeParameterIdx]
  );

  namedTypes.set(key, instantiatedIr);
  return visitIR(instantiatedIr, state);
}

function visitPrimitiveType(
  ir: PrimitiveType
): Validator<Ast.NONE> | Validator<Ast.INLINE> {
  const { typeName } = ir;
  const validator = primitives.get(typeName);
  if (!validator) {
    throwUnexpectedError(`unexpected primtive type: ${typeName}`);
  }
  return validator;
}

function isNonEmptyValidator(
  validator: Validator<Ast>
): validator is Validator<Ast.INLINE> | Validator<Ast.FUNCTION> {
  return validator.type === Ast.INLINE || validator.type === Ast.FUNCTION;
}

function wrapValidator(
  validator: Validator<Ast.FUNCTION> | Validator<Ast.INLINE>,
  paramName: string
): string {
  const { code, type } = validator;
  if (type === Ast.FUNCTION) {
    return `(${code})(${paramName})`;
  } else {
    return `(${code.replace(TEMPLATE_VAR, paramName)})`;
  }
}

const ensureTrailingNewline = (s: string) =>
  s.slice(-1) === "\n" ? s : s + "\n";
const getParamName = (idx: number) => `p${idx}`;

function wrapWithFunction(code: string, paramName: string): string {
  return codeBlock`
  ${paramName} => {
    ${code}
    return true;
  }`;
}

function visitObjectPattern(node: ObjectPattern, state: State): Validator<Ast> {
  const { numberIndexerType, stringIndexerType, properties } = node;
  const paramName = getParamName(state.paramIdx);
  const destructuredKeyName = "v";
  let validateStringKeyCode = "";
  // s = string
  const sV = stringIndexerType ? visitIR(stringIndexerType, state) : null;
  if (sV !== null && isNonEmptyValidator(sV)) {
    validateStringKeyCode = `if (!${wrapValidator(
      sV,
      destructuredKeyName
    )}) return false;`;
  }
  let validateNumberKeyCode = "";
  // n = number
  const nV = numberIndexerType ? visitIR(numberIndexerType, state) : null;
  if (nV !== null && isNonEmptyValidator(nV)) {
    validateNumberKeyCode = `if (!isNan(${paramName}) && !${wrapValidator(
      nV,
      destructuredKeyName
    )}) return false;`;
  }

  let indexValidatorCode = "";
  if (sV || nV) {
    indexValidatorCode = codeBlock`
    for (const [k, ${destructuredKeyName}] of Object.entries(${paramName})) {
      ${ensureTrailingNewline(validateStringKeyCode)}${validateNumberKeyCode}
    }
    `;
  }

  let propertyValidatorCode = "";
  for (let i = 0; i < properties.length; ++i) {
    const prop = properties[i];
    const { keyName, optional, value } = prop;
    const valueV = visitIR(value, state);
    if (isNonEmptyValidator(valueV)) {
      let code = "";
      const valueVCode = wrapValidator(valueV, `${paramName}.${keyName}`);
      if (optional) {
        // TODO: Add ad-hoc helpers so
        // the generated code is smaller
        code = `if (Object.prototype.hasOwnProperty.call(${paramName}, "${keyName}") && !${valueVCode}) return false;`;
      } else {
        code = `if (!Object.prototype.hasOwnProperty.call(${paramName}, "${keyName}") || !${valueVCode}) return false;`;
      }
      propertyValidatorCode +=
        i === properties.length - 1 ? code : ensureTrailingNewline(code);
    }
  }

  return {
    type: Ast.FUNCTION,
    code: wrapWithFunction(
      `${ensureTrailingNewline(indexValidatorCode)}${propertyValidatorCode}`,
      paramName
    ),
  };
}
