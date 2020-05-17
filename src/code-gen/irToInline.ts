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
  Tuple,
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
  EXPR,
}

interface Validator<T extends Ast> {
  type: T;
  code: T extends Ast.NONE ? null : string;
}

// this is compiled into a RegExp
// so make sure it doesn't have special characters
const TEMPLATE_VAR = "TEMPLATE";
const TEMPLATE_REGEXP = new RegExp(TEMPLATE_VAR, "g");

const primitives: ReadonlyMap<
  PrimitiveTypeName,
  // Holy fuck this actually caught a nasty bug. Note this for later.
  // TODO: Have TEMPLATE_EXPR type to catch smaller errors
  Readonly<Validator<Ast.NONE> | Validator<Ast.EXPR>>
> = new Map([
  ["any", { type: Ast.NONE, code: null }],
  ["unknown", { type: Ast.NONE, code: null }],
  ["null", { type: Ast.EXPR, code: `${TEMPLATE_VAR} === null` }],
  ["undefined", { type: Ast.EXPR, code: `${TEMPLATE_VAR} === undefined` }],
  ["boolean", { type: Ast.EXPR, code: `typeof ${TEMPLATE_VAR} === "boolean"` }],
  ["number", { type: Ast.EXPR, code: `typeof ${TEMPLATE_VAR} === "number"` }],
  ["string", { type: Ast.EXPR, code: `typeof ${TEMPLATE_VAR} === "string"` }],
  [
    "object",
    {
      type: Ast.EXPR,
      code: `typeof ${TEMPLATE_VAR} === "object" && ${TEMPLATE_VAR} !== null`,
    },
  ],
]);

// Array is technically not a primitive type
const IS_ARRAY = `!!${TEMPLATE_VAR} && ${TEMPLATE_VAR}.constructor === Array`;

interface State {
  readonly namedTypes: Map<string, IR>;
  readonly referencedTypeNames: string[];
  // theoretically all anonymous validation functions
  // could use the same parameter "p", but we give them unique parameters
  // p0, p1, ... this prevents bugs from hiding due to shadowing
  // (we prefer an explicit crash in the validator, so the user of the library can report it)
  readonly parentParamIdx: number;
  // If this exists, then treat this as the parameter name
  // When creating a new function, reset this value b/c the function
  // will have a parameter like p0
  readonly parentParamName: string | null;
}

export function generateValidator(ir: IR, namedTypes: Map<string, IR>): string {
  const state: State = {
    referencedTypeNames: [],
    parentParamIdx: 0,
    parentParamName: null,
    namedTypes,
  };
  const validator = visitIR(ir, state);
  const paramName = getParam(state);
  if (isNonEmptyValidator(validator)) {
    const { code } = validator;
    return `${paramName} => ${code}`;
  } else {
    // If type is Ast.NONE then no validation needs to be done
    if (namedTypes.size !== 0) {
      throw new Error(
        `For ir: ${ir}, namedTypes had non-zero size: ${namedTypes.size}`
      );
    }
    return `p => true`;
  }
}

export function visitIR(ir: IR, state: State): Validator<Ast> {
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
    case "tuple":
      visitorFunction = visitTuple;
      break;
    case "literal":
      visitorFunction = visitLiteral;
      break;
    default:
      throwUnexpectedError(`unexpected ir type: ${ir.type}`);
  }
  return visitorFunction(ir, state);
}
const wrapWithFunction = (
  code: string,
  // TODO: We can probably get rid of the number param and just accept
  // string | null
  functionParamIdxOrName: number | string | null,
  state: State
): string => {
  const functionParam =
    typeof functionParamIdxOrName === "string"
      ? functionParamIdxOrName
      : functionParamIdxOrName === null
      ? ""
      : getFunctionParam(functionParamIdxOrName);
  return codeBlock`
  ((${functionParam}) => {
    ${code}
    return true;
  })(${functionParam === "" ? "" : getParam(state)})`;
};

const getFunctionParam = (parentParamIdx: number) => `p${parentParamIdx}`;
const getParam = ({ parentParamIdx, parentParamName }: State) =>
  parentParamName !== null ? parentParamName : getFunctionParam(parentParamIdx);
const template = (code: string, name: string) =>
  code.replace(TEMPLATE_REGEXP, name);

function visitTuple(ir: Tuple, state: State): Validator<Ast.EXPR> {
  debugger;
  const parameterName = getParam(state);
  const { childTypes, firstOptionalIndex, restType } = ir;
  let lengthCheckCode = `(${template(IS_ARRAY, parameterName)})`;
  if (firstOptionalIndex === childTypes.length && !restType) {
    lengthCheckCode += `&& ${parameterName}.length === ${firstOptionalIndex}`;
  } else if (!restType) {
    lengthCheckCode += `&& ${parameterName}.length >= ${firstOptionalIndex} && ${parameterName}.length <= ${childTypes.length}`;
  } else {
    lengthCheckCode += `&& ${parameterName}.length >= ${firstOptionalIndex}`;
  }
  let verifyNonRestElementsCode = ``;
  for (let i = 0; i < childTypes.length; ++i) {
    // TODO: Can we optimize this so once we hit the array length, we don't perform the rest of the boolean operations
    // Maybe with a switch? What we really need is goto...
    const arrayAccessCode = `${parameterName}[${i}]`;
    const elementValidator = visitIR(childTypes[i], {
      ...state,
      parentParamName: arrayAccessCode,
    });
    if (elementValidator.type === Ast.NONE) continue;
    const { code } = elementValidator;
    verifyNonRestElementsCode += " ";
    if (i < firstOptionalIndex) {
      verifyNonRestElementsCode += `&& ${code}`;
    } else {
      verifyNonRestElementsCode += `&& ((${i} < ${parameterName}.length && (${code} || ${arrayAccessCode} === undefined)) || ${i} >= ${parameterName}.length)`;
    }
  }

  const noRestElementValidator: Validator<Ast.EXPR> = {
    type: Ast.EXPR,
    code: `${lengthCheckCode}${verifyNonRestElementsCode}`,
  };

  if (restType === undefined) {
    return noRestElementValidator;
  } else {
    const indexVar = "i";
    const restTypeValidator = visitIR(restType.elementType, {
      ...state,
      parentParamName: `${parameterName}[${indexVar}]`,
    });
    if (restTypeValidator.type === Ast.NONE) return noRestElementValidator;
    const restElementValidatorCode = wrapWithFunction(
      codeBlock`
    let ${indexVar} = ${childTypes.length};
    while (${indexVar} < ${parameterName}.length) {
      if (!${restTypeValidator.code}) return false;
      ${indexVar}++
    }
    `,
      null,
      state
    );
    return {
      type: Ast.EXPR,
      code: `${lengthCheckCode}${verifyNonRestElementsCode} && ${restElementValidatorCode}`,
    };
  }
}

function visitLiteral(ir: Literal, state: State): Validator<Ast.EXPR> {
  // TODO: Once we add bigint support, this will need to be updated
  const resolvedParentParamName = getParam(state);
  const { value } = ir;
  return {
    type: Ast.EXPR,
    code: template(
      `${TEMPLATE_VAR} === ${
        typeof value === "string" ? JSON.stringify(value) : value
      }`,
      resolvedParentParamName
    ),
  };
}

function visitUnion(ir: Union, state: State): Validator<Ast.NONE | Ast.EXPR> {
  const childTypeValidators: Validator<Ast.EXPR>[] = [];
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
    const { code } = v;
    ifStmtConditionCode += ifStmtConditionCode === "" ? code : `|| ${code}`;
  }
  return {
    type: Ast.EXPR,
    // TODO: Which is faster? "if(!(cond1 || cond2))" or "if(!cond1 && !cond2)"
    code: `(${ifStmtConditionCode})`,
  };
}

function visitArray(ir: ArrayType, state: State): Validator<Ast.EXPR> {
  const { parentParamIdx } = state;
  const parentParamName = getParam(state);
  const propertyVerifierParamIdx = parentParamIdx + 1;
  const propertyVerifierParamName = getFunctionParam(propertyVerifierParamIdx);
  const loopElementIdx = propertyVerifierParamIdx + 1;
  const loopElementName = getFunctionParam(loopElementIdx);
  const propertyValidator = visitIR(ir.elementType, {
    ...state,
    parentParamIdx: loopElementIdx,
    parentParamName: null,
  });
  // fastest method for validating whether an object is an array
  // https://jsperf.com/instanceof-array-vs-array-isarray/38
  // https://jsperf.com/is-array-safe
  // without the !! the return value for p0 => p0 && p0.constructor with an input of undefined
  // would be undefined instead of false
  const checkIfArray = `(${template(IS_ARRAY, parentParamName)})`;
  let checkProperties = "";
  if (isNonEmptyValidator(propertyValidator)) {
    checkProperties = codeBlock`
    for (const ${loopElementName} of ${propertyVerifierParamName}) {
      if (!${propertyValidator.code}) return false;
    }`;
  }

  let finalCode = checkIfArray;
  if (checkProperties) {
    finalCode += `&& ${wrapWithFunction(
      checkProperties,
      propertyVerifierParamIdx,
      state
    )}`;
  }

  return {
    type: Ast.EXPR,
    code: finalCode,
  };
}

function assertAcceptsTypeParameters(
  ir: IR,
  typeName: string
): asserts ir is Interface | TypeAlias {
  if (!isInterface(ir) && !isTypeAlias(ir)) {
    throw new MacroError(
      Errors.TypeDoesNotAcceptGenericParameters(typeName, ir.type)
    );
  }
}

// TODO: I want to unit test this function. How?
function replaceTypeParameters(
  ir: IR,
  replacer: (typeParameterIndex: number) => IR
): IR {
  function helper(current: IR): void {
    for (const [key, val] of Object.entries(current)) {
      if (typeof val !== "object") continue;
      if (isGenericType(val)) {
        // https://stackoverflow.com/questions/61807202/convince-typescript-that-object-has-key-from-object-entries-object-keys
        // @ts-ignore
        current[key] = replacer(val.typeParameterIndex);
      } else if (Array.isArray(val)) {
        for (let i = 0; i < val.length; ++i) {
          const element = val[i];
          if (isGenericType(element)) {
            val[i] = replacer(element.typeParameterIndex);
          } else {
            helper(element);
          }
        }
      } else if (isIR(val)) {
        helper(val);
      }
    }
  }
  const copy = deepCopy(ir);
  helper(copy);
  return copy;
}

// TODO: We can add 2nd level caching of the actual validation functions
/**
 * This doesn't just visit Type nodes, it also handles interfaces declarations
 * and type alias declarations because those are the only IR nodes that can
 * accept type parameters, and they are top level/not nested, so there is no
 * point dispatching a visitor.
 */
function visitType(ir: Type, state: State): Validator<Ast> {
  const { namedTypes } = state;
  const { typeName, typeParameters: providedTypeParameters = [] } = ir;
  const referencedIr = namedTypes.get(typeName);
  if (referencedIr === undefined) {
    throw new MacroError(Errors.UnregisteredType(typeName));
  }

  assertAcceptsTypeParameters(referencedIr, typeName);
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

function getPrimitive(
  typeName: PrimitiveTypeName
): Validator<Ast.NONE> | Validator<Ast.EXPR> {
  const validator = primitives.get(typeName);
  if (!validator) {
    throwUnexpectedError(`unexpected primitive type: ${typeName}`);
  }
  return validator;
}

function visitPrimitiveType(
  ir: PrimitiveType,
  state: State
): Validator<Ast.NONE> | Validator<Ast.EXPR> {
  const { typeName } = ir;
  const validator = getPrimitive(typeName);
  if (isNonEmptyValidator(validator)) {
    return {
      ...validator,
      code: `(${template(validator.code, getParam(state))})`,
    };
  }
  return validator;
}

function isNonEmptyValidator(
  validator: Validator<Ast>
): validator is Validator<Ast.EXPR> {
  return validator.type === Ast.EXPR;
}

const ensureTrailingNewline = (s: string) =>
  s.slice(-1) === "\n" ? s : s + "\n";
//const getParamName = (idx: number) => `p${idx}`;

function visitObjectPattern(node: ObjectPattern, state: State): Validator<Ast> {
  // TODO: Make this code more concise, let's just use some arbitrary parameter name
  // instead of incrementing the number
  // TODO: do subtype optimization
  const { numberIndexerType, stringIndexerType, properties } = node;
  const { parentParamIdx } = state;
  const parentParamName = getParam(state);
  const indexSignatureFunctionParamIdx = parentParamIdx + 1;
  const indexSignatureFunctionParamName = getFunctionParam(
    indexSignatureFunctionParamIdx
  );
  const destructuredKeyName = "k";
  const destructuredValueName = "v";
  let validateStringKeyCode = "";
  const indexerState: State = {
    ...state,
    parentParamName: destructuredValueName,
  };
  // s = string
  const sV = stringIndexerType
    ? visitIR(stringIndexerType, indexerState)
    : null;
  if (sV !== null && isNonEmptyValidator(sV)) {
    validateStringKeyCode = `if (!${sV.code}) return false;`;
  }
  let validateNumberKeyCode = "";
  // n = number
  const nV = numberIndexerType
    ? visitIR(numberIndexerType, indexerState)
    : null;
  if (nV !== null && isNonEmptyValidator(nV)) {
    validateNumberKeyCode = `if ((!isNaN(${destructuredKeyName}) || ${destructuredKeyName} === "NaN") && !${nV.code}) return false;`;
  }

  let indexValidatorCode = "";
  if (sV || nV) {
    indexValidatorCode = codeBlock`
    for (const [${destructuredKeyName}, ${destructuredValueName}] of Object.entries(${indexSignatureFunctionParamName})) {
      ${ensureTrailingNewline(validateStringKeyCode)}${validateNumberKeyCode}
    }
    `;
  }

  let propertyValidatorCode = "";
  const checkTruthy = `!!${parentParamName}`;
  for (let i = 0; i < properties.length; ++i) {
    const prop = properties[i];
    const { keyName, optional, value } = prop;
    // https://stackoverflow.com/questions/54896541/validating-property-names-with-regex/54896677#54896677
    const canUseDotNotation =
      typeof keyName === "string" && /^(?![0-9])[a-zA-Z0-9$_]+$/.test(keyName);
    // TODO: Check JSON.stringify won't damage the property name
    const escapedKeyName = JSON.stringify(keyName);
    const propertyAccess = canUseDotNotation
      ? `${parentParamName}.${keyName}`
      : `${parentParamName}[${escapedKeyName}]`;
    const valueV = visitIR(value, {
      ...state,
      parentParamName: propertyAccess,
    });
    if (isNonEmptyValidator(valueV)) {
      let code = "";
      if (optional) {
        // TODO: Add ad-hoc helpers so
        // the generated code is smaller
        code = oneLine`(${checkTruthy} && ${propertyAccess} === undefined) || ${valueV.code}`;
      } else {
        code = oneLine`(${checkTruthy} && Object.prototype.hasOwnProperty.call(
          ${parentParamName}, ${escapedKeyName})) && ${valueV.code}`;
      }
      code = `(${code})`;
      propertyValidatorCode += i === 0 ? code : `&& ${code}`;
    }
  }

  if (!indexValidatorCode && !propertyValidatorCode) {
    // no index or property signatures means it is just an empty object
    const isObjectV = getPrimitive("object");
    let isObjectCode;
    if (isNonEmptyValidator(isObjectV)) {
      isObjectCode = template(isObjectV.code, parentParamName);
    } else {
      throwUnexpectedError(
        `did not find validator for "object" in primitives map`
      );
    }
    return {
      type: Ast.EXPR,
      code: `(${isObjectCode})`,
    };
  }

  let finalCode = `(`;
  if (indexValidatorCode) {
    // need checkTruthy so Object.entries doesn't crash
    finalCode += `${checkTruthy} && ${wrapWithFunction(
      indexValidatorCode,
      indexSignatureFunctionParamIdx,
      state
    )} `;
  }
  if (propertyValidatorCode) {
    if (indexValidatorCode) finalCode += "&& ";
    finalCode += `${propertyValidatorCode}`;
  }
  finalCode += `)`;

  return {
    type: Ast.EXPR,
    code: finalCode,
  };
}
