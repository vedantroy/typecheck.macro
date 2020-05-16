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
  primitiveTypes,
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
  debugger;
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
  }
  // If type is Ast.NONE then no validation needs to be done
  return `p => true`;
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
  functionParamIdx: number,
  state: State
) =>
  codeBlock`
  (${getFunctionParam(functionParamIdx)} => {
    ${code}
    return true;
  })(${getParam(state)})`;

const getFunctionParam = (parentParamIdx: number) => `p${parentParamIdx}`;
const getParam = ({ parentParamIdx, parentParamName }: State) =>
  parentParamName !== null ? parentParamName : getFunctionParam(parentParamIdx);
const template = (code: string, name: string) =>
  code.replace(TEMPLATE_REGEXP, name);

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
  const checkIfArray = `(!!${parentParamName} && ${parentParamName}.constructor === Array)`;
  let checkProperties = "";
  if (isNonEmptyValidator(propertyValidator)) {
    checkProperties = codeBlock`
    for (const ${loopElementName} of ${propertyVerifierParamName}) {
      if (!${propertyValidator.code}) return false;
    }`;
  }
  return {
    type: Ast.EXPR,
    code: `${checkIfArray}${
      checkProperties
        ? ` && ${wrapWithFunction(
            checkProperties,
            propertyVerifierParamIdx,
            state
          )}`
        : ""
    }`,
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
  const { numberIndexerType, stringIndexerType, properties } = node;
  const { parentParamIdx } = state;
  const parentParamName = getParam(state);
  const indexSignatureFunctionParamIdx = parentParamIdx + 1;
  const indexSignatureFunctionParamName = getFunctionParam(
    indexSignatureFunctionParamIdx
  );
  const indexSignatureValueIdx = indexSignatureFunctionParamIdx + 1;
  const indexSignatureValueName = getFunctionParam(indexSignatureValueIdx);
  const destructuredKeyName = "k";
  let validateStringKeyCode = "";
  const indexerState: State = {
    ...state,
    parentParamName: null,
    parentParamIdx: indexSignatureValueIdx,
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
    for (const [${destructuredKeyName}, ${indexSignatureValueName}] of Object.entries(${indexSignatureFunctionParamName})) {
      ${ensureTrailingNewline(validateStringKeyCode)}${validateNumberKeyCode}
    }
    `;
  }

  let propertyValidatorCode = "";
  //const checkNotNullOrUndefined = `${parentParamName} !== undefined && ${parentParamName} !== null`;
  const checkTruthy = `!!${parentParamName}`;
  for (let i = 0; i < properties.length; ++i) {
    const prop = properties[i];
    const { keyName, optional, value } = prop;
    // TODO: Check if this escaping is sufficient. Also see if we can make it more performant.
    const escapedKeyName = JSON.stringify(keyName);
    const valueV = visitIR(value, {
      ...state,
      parentParamName: `${parentParamName}[${escapedKeyName}]`,
    });
    if (isNonEmptyValidator(valueV)) {
      let code = "";
      if (optional) {
        // TODO: Add ad-hoc helpers so
        // the generated code is smaller
        code = oneLine`(${checkTruthy} && !Object.prototype.hasOwnProperty.call(
          ${parentParamName}, ${escapedKeyName})) || ${valueV.code}`;
      } else {
        code = oneLine`(${checkTruthy} && Object.prototype.hasOwnProperty.call(
          ${parentParamName}, ${escapedKeyName})) && ${valueV.code}`;
      }
      code = `(${code})`;
      propertyValidatorCode += i === 0 ? code : `&& ${code}`;
    }
  }

  // it's an empty object
  if (!indexValidatorCode && !propertyValidatorCode) {
    const isObjectV = getPrimitive("object");
    if (isNonEmptyValidator(isObjectV)) {
      propertyValidatorCode = template(isObjectV.code, parentParamName);
    } else {
      throwUnexpectedError(
        `did not find validator for "object" in primitives map`
      );
    }
  }

  return {
    type: Ast.EXPR,
    code: `(${
      indexValidatorCode
        ? `${wrapWithFunction(
            indexValidatorCode,
            indexSignatureFunctionParamIdx,
            state
          )}${propertyValidatorCode ? "&&" : ""}`
        : ""
    }${indexValidatorCode ? " " : ""}${propertyValidatorCode})`,
  };
}
