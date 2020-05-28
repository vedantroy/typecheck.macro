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
import { isPrimitive, isLiteral, isUnion } from "../type-ir/IRUtils";
import { safeGet } from "../utils/checks";
import { stringify } from "javascript-stringify";

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
const ERROR_FLAG = "success";
const SETUP_ERROR_FLAG = `let ${ERROR_FLAG} = true;\n`;

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

// circle-detection
// tuple fix
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

// TODO: Add parent node, could potentially replace
// underUnion (since all unions are truly flattened)/is more general.
interface State {
  readonly opts: Options;
  readonly instantiatedTypes: Map<string, TypeInfo>;
  readonly typeStats: Map<string, number>;
  // key = instantiated type name
  // value = hoisted function index
  readonly hoistedTypes: Map<string, number>;
  readonly parentParamName: string;

  /**
   * If we are the child of a union,
   * then we shouldn't report errors on failed validation
   * because we could be one of many possible paths
   */
  readonly underUnion: boolean;
  readonly path: string;
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
  if (isNonEmptyValidator(validator)) {
    return addHoistedFunctionsAndErrorReporting(validator, state, ir);
  }
  throw new MacroError(oneLine`You tried to generate a validator for a type that simplifies to "any", which is non-sensical because
                        a validator for an object of type any would always return true.`);
  //return `p => true`;
}

function addHoistedFunctionsAndErrorReporting(
  { code, noErrorGenNeeded }: Validator<Ast>,
  state: State,
  ir: IR
) {
  const { hoistedTypes, instantiatedTypes, path } = state;
  const base = `${state.parentParamName} => ${code}`;
  const {
    opts: { errorMessages },
  } = state;
  if (hoistedTypes.size === 0 && !errorMessages) return base;
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
  const cond = `(${base})(x)`;
  if (errorMessages) {
    return codeBlock`
    (x, ${ERRORS_ARRAY}) => {
      ${hoistedFuncs.join("\n")}
      ${
        noErrorGenNeeded
          ? `return ${cond}`
          : codeBlock`
          ${wrapFalsyExprWithErrorReporter(
            "!" + cond,
            path,
            "x",
            ir,
            Action.RETURN
          )}
          return true;
      `
      }
    }
    `;
  }
  return codeBlock`
  x => {
    ${hoistedFuncs.join("\n")}
    return ${cond};
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

enum Return {
  TRUE,
  ERROR_FLAG,
}

const wrapWithFunction = <T extends string | null>(
  code: string,
  {
    parentParam,
    functionParam,
  }: { parentParam: T; functionParam: T extends string ? string : null },
  returnValue = Return.TRUE
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
    return ${Return.TRUE ? "true" : ERROR_FLAG};
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

// TODO: there should be an underArray variable in the state
// so the parent function can generate a validator and report the exact index of failure.
// the only other alternative is constructing the reporter path at runtime which sounds
// fucking... AWFUL
function generateArrayValidator(
  ir: BuiltinType<"Array">,
  state: State
): Validator<Ast.EXPR> {
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

// TODO: Update this for intersection types
// TODO: Since tuples are static types -- we can generate exact error messages
// for their indexes/children
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
      path: state.path + `'[${i}]`,
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
    const validator = visitIR(childType, { ...state, underUnion: true });
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
  ifStmtConditionCode = "(" + ifStmtConditionCode + ")";

  return {
    type: Ast.EXPR,
    // TODO: Which is faster? "if(!(cond1 || cond2))" or "if(!cond1 && !cond2)"
    code: ifStmtConditionCode,
    noErrorGenNeeded: false,
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

function shouldReportErrors(state: State): boolean {
  return state.opts.errorMessages && !state.underUnion;
}

/*
function wrapConditionWithErrorReporter(code: string, path: string): string {
  return codeBlock`
  if (!${code}) {
    ${ERRORS_ARRAY}.push("${path}")
    return false;
  }
  `;
}
*/

/***
 * Problem: if we are directly under an array, we want to hoist the error reporting
 * this can be done by default in literals/primitive types.
 *
 * The issue arrises when we hit unions. Then, if it's **directly** under the array
 * we want to inline it. But otherwise... if it's not directly under (an array as part
 * of a property of an object expression), we want to do our normal thing. Or actually,
 * .... not really. This also applies with object patterns or set keys... really anything
 * like that. For those, we want to de-inline unions (since they don't have specific error messages)
 * But we don't want to inline objects (since they have specific error messages)
 *
 * An easy solution is to pass in the parent everywhere. Doing so gives us 10x more information
 * and allows us to de-inline unions when we want to (or object props or whatever)
 *
 * ideally we want a reactive representation of, like babel's path.. oh lord.
 *
 *  Let's go with the simple solution -- each state has a parent node object, which can be used
 * for basic analysis... (oh, we're **directly** under some important thing... let's inline!)
 *
 * Fucking hell.
 *
 * Oh wait, we can just make union types always defer to the parent. There's never a good reason for them
 * not to.
 *
 * The parent node abstract is something useful to keep in mind though.
 */

/*
function completelySurrounded(code: string): boolean {
  const stack: Array<"(" | ")"> = [];
  for(let i = 0; i < code.length; ++i) {
    const c = stack[i]
  }
}
*/

enum Action {
  RETURN,
  SET,
}

function wrapFalsyExprWithErrorReporter(
  code: string,
  pathExpr: string,
  actualExpr: string,
  expected: IR,
  action: Action
): string {
  return codeBlock`
    if (${code}) {
      ${ERRORS_ARRAY}.push([${pathExpr}, ${actualExpr}, ${stringify(
    expected
  )}]);
      ${action === Action.RETURN ? "return false" : `${ERROR_FLAG} = false`};
    }
    `;
}

function visitObjectPattern(node: ObjectPattern, state: State): Validator<Ast> {
  const { path } = state;
  const { numberIndexerType, stringIndexerType, properties } = node;
  const parentParam = state.parentParamName;
  const keyName = "k";
  const valueName = "v";
  let validateStringKeyCode = "";
  const indexerState: State = {
    ...state,
    parentParamName: valueName,
  };

  const pathExpr = `"${path}[\\"" + ${keyName} + "\\"]"`;
  // s = string
  const sV = stringIndexerType
    ? visitIR(stringIndexerType, indexerState)
    : null;
  if (sV !== null && isNonEmptyValidator(sV)) {
    const cond = `!(${sV.code})`;
    if (shouldReportErrors(state) && !sV.noErrorGenNeeded) {
      validateStringKeyCode = wrapFalsyExprWithErrorReporter(
        cond,
        pathExpr,
        valueName,
        stringIndexerType!!,
        Action.SET
      );
    } else {
      validateStringKeyCode = `if (${cond}) return false;`;
    }
  }
  let validateNumberKeyCode = "";
  // n = number
  const nV = numberIndexerType
    ? visitIR(numberIndexerType, indexerState)
    : null;
  if (nV !== null && isNonEmptyValidator(nV)) {
    const cond = `(!isNaN(${keyName}) || ${keyName} === "NaN") && !${nV.code}`;
    if (shouldReportErrors(state) && !nV.noErrorGenNeeded) {
      validateNumberKeyCode = wrapFalsyExprWithErrorReporter(
        cond,
        pathExpr,
        valueName,
        numberIndexerType!!,
        Action.SET
      );
    } else {
      validateNumberKeyCode = `if (${cond}) return false;`;
    }
  }

  let indexValidatorCode = "";
  if (sV || nV) {
    indexValidatorCode = codeBlock`
    for (const [${keyName}, ${valueName}] of Object.entries(${parentParam})) {
      ${ensureTrailingNewline(validateStringKeyCode)}${validateNumberKeyCode}
    }
    `;
  }

  let propertyValidatorCode = "";
  for (let i = 0; i < properties.length; ++i) {
    const prop = properties[i];
    const { keyName, optional, value } = prop;
    // https://stackoverflow.com/questions/54896541/validating-property-names-with-regex/54896677#54896677
    const canUseDotNotation =
      typeof keyName === "string" && /^(?![0-9])[a-zA-Z0-9$_]+$/.test(keyName);
    // TODO: Check JSON.stringify won't damage the property name
    const escapedKeyName = JSON.stringify(keyName);
    const accessor = canUseDotNotation ? `.${keyName}` : `[${escapedKeyName}]`;
    const propertyAccess = `${parentParam}${accessor}`;
    const valueV = visitIR(value, {
      ...state,
      parentParamName: propertyAccess,
      path: `${path}${accessor}`,
    });
    if (isNonEmptyValidator(valueV)) {
      let truthy = "";
      if (optional) {
        truthy = oneLine`(${propertyAccess} === undefined) || ${valueV.code}`;
      } else {
        // TODO: Add ad-hoc helpers so
        // the generated code is smaller
        truthy = oneLine`(Object.prototype.hasOwnProperty.call(
          ${parentParam}, ${escapedKeyName})) && ${valueV.code}`;
      }
      truthy = `(${truthy})`;
      if (shouldReportErrors(state)) {
        propertyValidatorCode += wrapFalsyExprWithErrorReporter(
          "!" + truthy,
          `'${path}[${escapedKeyName}]'`,
          propertyAccess,
          value,
          Action.SET
        );
      } else {
        propertyValidatorCode += i === 0 ? truthy : `&& ${truthy}`;
      }
    }
  }

  if (!indexValidatorCode && !propertyValidatorCode) {
    // no index or property signatures means it is just an empty object
    const isObjectV = getPrimitive("object");
    let isObjectCode;
    if (isNonEmptyValidator(isObjectV)) {
      isObjectCode = "(" + template(isObjectV.code, parentParam) + ")";
    } else {
      throwUnexpectedError(
        `did not find validator for "object" in primitives map`
      );
    }
    if (shouldReportErrors(state)) {
      isObjectCode = wrapFalsyExprWithErrorReporter(
        `!${isObjectCode}`,
        `"${path}"`,
        parentParam,
        node,
        Action.SET
      );
    }
    return {
      type: Ast.EXPR,
      code: `${isObjectCode}`,
    };
  }

  let finalCode = "";
  if (shouldReportErrors(state)) {
    const checkNotTruthyCode = wrapFalsyExprWithErrorReporter(
      `!${parentParam}`,
      path,
      parentParam,
      node,
      Action.RETURN
    );
    if (indexValidatorCode) {
      finalCode = checkNotTruthyCode;
      finalCode += SETUP_ERROR_FLAG;
      finalCode += indexValidatorCode;
    }
    if (propertyValidatorCode) {
      if (indexValidatorCode) finalCode += propertyValidatorCode;
      else
        finalCode +=
          checkNotTruthyCode + SETUP_ERROR_FLAG + propertyValidatorCode;
    }
    finalCode = wrapWithFunction(
      finalCode,
      {
        parentParam: null,
        functionParam: null,
      },
      Return.ERROR_FLAG
    );
  } else {
    const checkNotTruthy = `!!${parentParam}`;
    finalCode += `(`;
    if (indexValidatorCode) {
      // need checkTruthy so Object.entries doesn't crash
      finalCode += `${checkNotTruthy} && ${wrapWithFunction(
        indexValidatorCode,
        {
          functionParam: null,
          parentParam: null,
        }
      )} `;
    }
    if (propertyValidatorCode) {
      if (indexValidatorCode) finalCode += `&& ${propertyValidatorCode}`;
      else finalCode += `${checkNotTruthy} && ${propertyValidatorCode}`;
    }
    finalCode += `)`;
  }

  return {
    type: Ast.EXPR,
    code: finalCode,
    noErrorGenNeeded: true,
  };
}
