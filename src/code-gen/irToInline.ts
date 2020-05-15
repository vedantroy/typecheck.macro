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
  ArrayType,
  Union,
  Literal,
} from "../type-ir/typeIR";
import { MacroError } from "babel-plugin-macros";
import { Errors, throwUnexpectedError } from "../macro-assertions";
import { codeBlock, oneLine } from "common-tags";
import deepCopy from "fast-copy";
import deterministicStringify from "../utils/stringify";

function isInterface(ir: IR): ir is Interface {
  return ir.type === "interface";
}

function isTypeAlias(ir: IR): ir is TypeAlias {
  return ir.type === "alias";
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

enum Ast {
  NONE,
  INLINE,
  FUNCTION,
}

interface Validator<T extends Ast> {
  type: T;
  code: T extends Ast.NONE ? null : string;
}

// this is compiled into a RegExp
// so make sure it doesn't have special characters
// TODO: micro optimization lift the RegExp out of the function
// into global scope so it is only constructed once
const TEMPLATE_VAR = "TEMPLATE";

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
  debugger;
  const state: State = { referencedTypeNames: [], paramIdx: 0, namedTypes };
  const validator = visitIR(ir, state);
  const { type } = validator;
  const paramName = getParamName(0);
  if (isNonEmptyValidator(validator)) {
    const { code } = validator;
    return type === Ast.FUNCTION
      ? code
      : `${paramName} => ${wrapValidator(validator, paramName)}`;
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
    case "arrayType":
      visitorFunction = visitArray;
      break;
    case "union":
      visitorFunction = visitUnion;
      break;
    case "literal":
      visitorFunction = visitLiteral;
      break;
    default:
      throwUnexpectedError(`unexpected ir type: ${ir.type}`);
  }
  const validator = visitorFunction(ir, state);
  // Only functions have parameters
  if (validator.type !== Ast.FUNCTION) state.paramIdx -= 1;
  return visitorFunction(ir, state);
}

function visitLiteral(ir: Literal, state: State): Validator<Ast.INLINE> {
  // TODO: Once we add bigint support, this will need to be updated
  const { value } = ir;
  return {
    type: Ast.INLINE,
    code: `${TEMPLATE_VAR} === ${
      typeof value === "string" ? JSON.stringify(value) : value
    }`,
  };
}

function visitUnion(ir: Union, state: State): Validator<Ast.NONE | Ast.INLINE> {
  const childTypeValidators: Validator<Ast.INLINE | Ast.FUNCTION>[] = [];
  for (const childType of ir.childTypes) {
    const validator = visitIR(childType, state);
    if (isNonEmptyValidator(validator)) {
      childTypeValidators.push(validator);
    } else
      return {
        type: Ast.NONE,
        code: null,
      };
  }

  let ifStmtConditionCode = "";
  for (const v of childTypeValidators) {
    const code = `${wrapValidator(v, TEMPLATE_VAR)}`;
    ifStmtConditionCode += ifStmtConditionCode === "" ? code : `|| ${code}`;
  }
  return {
    type: Ast.INLINE,
    // TODO: Which is faster? "if(!(cond1 || cond2))" or "if(!cond1 && !cond2)"
    code: `${ifStmtConditionCode}`,
    /*
    code: wrapWithFunction(
      `if (!(${ifStmtConditionCode})) return false;`,
      paramName
    ),
    */
  };
}

function visitArray(ir: ArrayType, state: State): Validator<Ast.FUNCTION> {
  const paramName = getParamName(state.paramIdx);
  const elementName = "v";
  const validator = visitIR(ir.elementType, state);
  // fastest method for validating whether an object is an array
  // https://jsperf.com/instanceof-array-vs-array-isarray/38
  // https://jsperf.com/is-array-safe
  const checkIfArray = `if (!${paramName} || ${paramName}.constructor !== Array) return false;`;
  let checkProperties = "";
  if (isNonEmptyValidator(validator)) {
    checkProperties = codeBlock`
    for (const ${elementName} of ${paramName}) {
      if (!${wrapValidator(validator, elementName)}) return false;
    }
    `;
  }
  return {
    type: Ast.FUNCTION,
    code: wrapWithFunction(
      `${ensureTrailingNewline(checkIfArray)}${checkProperties}`,
      paramName
    ),
  };
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
    return `(${code.replace(new RegExp(TEMPLATE_VAR, 'g'), paramName)})`;
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
  const destructuredValueName = "v";
  let validateStringKeyCode = "";
  // s = string
  const sV = stringIndexerType ? visitIR(stringIndexerType, state) : null;
  if (sV !== null && isNonEmptyValidator(sV)) {
    validateStringKeyCode = `if (!${wrapValidator(
      sV,
      destructuredValueName
    )}) return false;`;
  }
  let validateNumberKeyCode = "";
  // n = number
  const nV = numberIndexerType ? visitIR(numberIndexerType, state) : null;
  if (nV !== null && isNonEmptyValidator(nV)) {
    validateNumberKeyCode = `if (!isNan(${paramName}) && !${wrapValidator(
      nV,
      destructuredValueName
    )}) return false;`;
  }

  let indexValidatorCode = "";
  if (sV || nV) {
    indexValidatorCode = codeBlock`
    for (const [k, ${destructuredValueName}] of Object.entries(${paramName})) {
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
