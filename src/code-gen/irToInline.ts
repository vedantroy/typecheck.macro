import {
  PrimitiveTypeName,
  IR,
  ObjectPattern,
  PrimitiveType,
  Union,
  Literal,
  Tuple,
  InstantiatedType,
  BuiltinType,
  BuiltinTypeName,
} from "../type-ir/IR";
import { MacroError } from "babel-plugin-macros";
import { throwUnexpectedError, throwMaybeAstError } from "../macro-assertions";
import { codeBlock, oneLine } from "common-tags";
import { TypeInfo } from "../type-ir/passes/instantiate";
import {
  isBuiltinType,
  isAnyOrUnknown,
  isPrimitive,
  isLiteral,
} from "../type-ir/IRUtils";
import { safeGet } from "../utils/checks";

enum Ast {
  NONE,
  EXPR,
}

interface Validator<T extends Ast> {
  type: T;
  code: T extends Ast.NONE ? null : string;
  noErrorGenNeeded?: boolean;
}

// this is compiled into a RegExp
// so make sure it doesn't have special characters
const TEMPLATE_VAR = "TEMPLATE";
const TEMPLATE_REGEXP = new RegExp(TEMPLATE_VAR, "g");

const ERRORS_ARRAY = "errors";

const primitives: ReadonlyMap<
  PrimitiveTypeName,
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

// hoisting
// circle-detection
// these should be configurable
// error messages
//  - current task
// hasOwnProperty optimization
// custom funcs???

// Array is technically not a primitive type
const IS_ARRAY = `!!${TEMPLATE_VAR} && ${TEMPLATE_VAR}.constructor === Array`;

interface Options {
  readonly errorMessages: boolean;
}

interface State {
  readonly opts: Options;
  readonly path: string;
  readonly instantiatedTypes: Map<string, TypeInfo>;
  readonly typeStats: Map<string, number>;
  // key = instantiated type name
  // value = hoisted function name
  readonly hoistedTypes: Map<string, number>;
  readonly parentParamName: string;
  readonly underUnion: boolean;
}

export default function generateValidator(
  ir: IR,
  {
    instantiatedTypes,
    options,
    typeStats,
  }: {
    instantiatedTypes: Map<string, TypeInfo>;
    options: Options;
    typeStats: Map<string, number>;
  }
): string {
  const state: State = {
    opts: options,
    hoistedTypes: new Map(),
    instantiatedTypes,
    typeStats,
    parentParamName: `p0`,
    path: "input", // TODO: Make this configurable
    underUnion: false,
  };
  const validator = visitIR(ir, state);
  const paramName = state.parentParamName;
  if (isNonEmptyValidator(validator)) {
    const { code } = validator;
    return addHoistedFunctions(`${paramName} => ${code}`, state);
  }
  return `p => true`;
}

function addHoistedFunctions(code: string, state: State) {
  const { hoistedTypes, instantiatedTypes } = state;
  if (hoistedTypes.size === 0) return code;
  const hoistedFuncs: string[] = [];
  for (const [key, val] of hoistedTypes) {
    const { value: ir } = safeGet(key, instantiatedTypes);
    const hoistedFuncParamName = `x${val}`;
    const funcCode = visitIR(ir, {
      ...state,
      parentParamName: hoistedFuncParamName,
    });
    if (funcCode.type === Ast.NONE) {
      throwUnexpectedError(
        `instantiated type: ${key} had empty validator but was hoisted anyway`
      );
    }
    hoistedFuncs.push(
      `const f${val} = ${hoistedFuncParamName} => ${funcCode.code}`
    );
  }
  return codeBlock`
  x => {
    ${hoistedFuncs.join("\n")}
    return (${code})(x)
  }`;
}

export function visitIR(ir: IR, state: State): Validator<Ast> {
  let visitorFunction: (ir: IR, state: State) => Validator<Ast>;
  switch (ir.type) {
    case "primitiveType":
      visitorFunction = visitPrimitiveType;
      break;
    case "instantiatedType":
      visitorFunction = visitInstantiatedType;
      break;
    case "objectPattern":
      visitorFunction = visitObjectPattern;
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
    case "builtinType":
      visitorFunction = visitBuiltinType;
      break;
    case "failedIntersection":
      throwMaybeAstError(
        `found failedIntersection while generating code. This generally means you have an invalid intersection in your types.`
      );
    default:
      throwUnexpectedError(`unexpected ir type: ${ir.type}`);
  }
  return visitorFunction(ir, state);
}

const wrapWithFunction = <T extends string | null>(
  code: string,
  {
    parentParam,
    functionParam,
  }: { parentParam: T; functionParam: T extends string ? string : null }
): string => {
  // TODO: Probably de-duplicate this
  if (typeof parentParam === "string" && parentParam.length === 0) {
    throwUnexpectedError(`passed empty string to parentParam`);
  }
  if (typeof functionParam === "string" && functionParam.length === 0) {
    throwUnexpectedError(`passed empty string to insideFunctionParam`);
  }
  return codeBlock`
  ((${functionParam === null ? "" : functionParam}) => {
    ${code}
    return true;
  })(${parentParam === null ? "" : parentParam})`;
};

const getNewParam = (oldParam: string) => {
  const lastChar = oldParam.slice(-1);
  if ("0" <= lastChar && lastChar <= "9") {
    const digit = (parseInt(lastChar) + 1) % 10;
    return oldParam.slice(0, -1) + digit.toString();
  }
  return `p0`;
};

const template = (code: string, name: string) =>
  code.replace(TEMPLATE_REGEXP, name);

function visitInstantiatedType(
  ir: InstantiatedType,
  state: State
): Validator<Ast> {
  const { instantiatedTypes, typeStats, hoistedTypes, parentParamName } = state;
  const { typeName } = ir;
  const occurrences = safeGet(typeName, typeStats);
  const instantiatedType = safeGet(typeName, instantiatedTypes);
  const { value } = instantiatedType;
  if (
    !(isPrimitive(value) || isLiteral(value)) &&
    (occurrences > 1 || instantiatedType.circular)
  ) {
    let hoistedFuncIdx;
    if (hoistedTypes.has(typeName)) {
      hoistedFuncIdx = safeGet(typeName, hoistedTypes);
    } else {
      hoistedFuncIdx = hoistedTypes.size;
      hoistedTypes.set(typeName, hoistedFuncIdx);
    }
    return {
      type: Ast.EXPR,
      code: `f${hoistedFuncIdx}(${parentParamName})`,
    };
  } else {
    return visitIR(instantiatedType.value, state);
  }
}

function visitBuiltinType(
  ir: BuiltinType<BuiltinTypeName>,
  state: State
): Validator<Ast.EXPR> {
  let validator: Validator<Ast.EXPR>;
  switch (ir.typeName) {
    case "Array":
      validator = generateArrayValidator(ir as BuiltinType<"Array">, state);
      break;
    case "Map":
    case "Set":
      throw new MacroError(
        `Code generation for ${ir.typeName} is not supported yet! Check back soon.`
      );
    default:
      throwUnexpectedError(`unexpected builtin type: ${ir.typeName}`);
  }
  return validator;
}

function generateArrayValidator(
  ir: BuiltinType<"Array">,
  state: State
): Validator<Ast.EXPR> {
  // TODO: simplify this stuff
  const { parentParamName } = state;
  const propertyVerifierParamName = getNewParam(parentParamName);
  const loopElementName = getNewParam(propertyVerifierParamName);
  const propertyValidator = visitIR(ir.elementTypes[0], {
    ...state,
    parentParamName: loopElementName,
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
    finalCode += `&& ${wrapWithFunction(checkProperties, {
      parentParam: parentParamName,
      functionParam: propertyVerifierParamName,
    })}`;
  }

  return {
    type: Ast.EXPR,
    code: finalCode,
  };
}

function visitTuple(ir: Tuple, state: State): Validator<Ast.EXPR> {
  const parameterName = state.parentParamName;
  const { childTypes, firstOptionalIndex, restType } = ir;
  let lengthCheckCode = `(${template(IS_ARRAY, parameterName)})`;

  if (firstOptionalIndex === childTypes.length) {
    lengthCheckCode += `&& ${parameterName}.length ${restType ? ">" : "="}=${
      restType ? "" : "="
    } ${childTypes.length}`;
  } else if (restType) {
    lengthCheckCode += `&& ${parameterName}.length >= ${firstOptionalIndex}`;
  } else {
    lengthCheckCode += `&& ${parameterName}.length >= ${firstOptionalIndex} && ${parameterName}.length <= ${childTypes.length}`;
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
    const restTypeValidator = visitIR(restType, {
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
      { parentParam: null, functionParam: null }
    );
    return {
      type: Ast.EXPR,
      code: `${lengthCheckCode}${verifyNonRestElementsCode} && ${restElementValidatorCode}`,
    };
  }
}

function visitLiteral(ir: Literal, state: State): Validator<Ast.EXPR> {
  // TODO: Once we add bigint support, this will need to be updated
  const parentParam = state.parentParamName;
  const { value } = ir;
  const literalValueAsCode =
    typeof value === "string" ? JSON.stringify(value) : value;
  const expr = template(
    `${TEMPLATE_VAR} === ${literalValueAsCode}`,
    parentParam
  );
  return {
    type: Ast.EXPR,
    code: expr,
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
  if (!isNonEmptyValidator(validator)) {
    return validator;
  }
  const expr = `(${template(validator.code, state.parentParamName)})`;
  if (isNonEmptyValidator(validator)) {
    return {
      ...validator,
      code: expr,
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
  // TODO: do subtype optimization
  const { opts, path, underUnion } = state;
  const { numberIndexerType, stringIndexerType, properties } = node;
  const parentParamName = state.parentParamName;
  const indexSignatureFunctionParamName = getNewParam(parentParamName);
  const keyName = "k";
  const valueName = "v";
  let validateStringKeyCode = "";
  const indexerState: State = {
    ...state,
    parentParamName: valueName,
  };
  // s = string
  const sV = stringIndexerType
    ? visitIR(stringIndexerType, indexerState)
    : null;
  if (sV !== null && isNonEmptyValidator(sV)) {
    if (opts.errorMessages && !underUnion) {
      validateStringKeyCode = codeBlock`
      if (!${sV.code}) {
        ${ERRORS_ARRAY}.push(${`${path}`})
        return false;
      }
      `;
    } else {
      validateStringKeyCode = `if (!${sV.code}) return false;`;
    }
  }
  let validateNumberKeyCode = "";
  // n = number
  const nV = numberIndexerType
    ? visitIR(numberIndexerType, indexerState)
    : null;
  if (nV !== null && isNonEmptyValidator(nV)) {
    validateNumberKeyCode = `if ((!isNaN(${keyName}) || ${keyName} === "NaN") && !${nV.code}) return false;`;
  }

  let indexValidatorCode = "";
  if (sV || nV) {
    indexValidatorCode = codeBlock`
    for (const [${keyName}, ${valueName}] of Object.entries(${indexSignatureFunctionParamName})) {
      ${ensureTrailingNewline(validateStringKeyCode)}${validateNumberKeyCode}
    }
    `;
  }

  const checkTruthy = `!!${parentParamName}`;
  let propertyValidatorCode = "";
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
        code = oneLine`(${propertyAccess} === undefined) || ${valueV.code}`;
      } else {
        code = oneLine`(Object.prototype.hasOwnProperty.call(
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
    finalCode += `${checkTruthy} && ${wrapWithFunction(indexValidatorCode, {
      functionParam: indexSignatureFunctionParamName,
      parentParam: parentParamName,
    })} `;
  }
  if (propertyValidatorCode) {
    if (indexValidatorCode) finalCode += `&& ${propertyValidatorCode}`;
    else finalCode += `${checkTruthy} && ${propertyValidatorCode}`;
  }
  finalCode += `)`;

  return {
    type: Ast.EXPR,
    code: finalCode,
    noErrorGenNeeded: true,
  };
}
