import { MacroError } from "babel-plugin-macros";
import { codeBlock, oneLine } from "common-tags";
import { stringify } from "javascript-stringify";
import { throwMaybeAstError, throwUnexpectedError } from "../macro-assertions";
import {
  BuiltinType,
  BuiltinTypeName,
  InstantiatedType,
  IR,
  Literal,
  ObjectPattern,
  PrimitiveType,
  PrimitiveTypeName,
  Tuple,
  Union,
} from "../type-ir/IR";
import { isInstantiatedType, isLiteral, isPrimitive } from "../type-ir/IRUtils";
import { TypeInfo } from "../type-ir/passes/instantiate";
import { safeGet } from "../utils/checks";

enum Ast {
  NONE,
  EXPR,
}

interface Validator<T extends Ast> {
  type: T;
  code: T extends Ast.NONE ? null : string;
  errorGenNeeded: boolean;
}

// this is compiled into a RegExp
// so make sure it doesn't have special characters
const TEMPLATE_VAR = "TEMPLATE";
const TEMPLATE_REGEXP = new RegExp(TEMPLATE_VAR, "g");

const ERRORS_ARRAY = "errors";
const SUCCESS_FLAG = "success";
const SETUP_SUCCESS_FLAG = `let ${SUCCESS_FLAG} = true;\n`;

const PATH_PARAM = "$path";

const primitives: ReadonlyMap<
  PrimitiveTypeName,
  // TODO: Have TEMPLATE_EXPR type to catch smaller errors
  Readonly<Validator<Ast.NONE> | Validator<Ast.EXPR>>
> = new Map([
  ["any", { type: Ast.NONE, code: null, errorGenNeeded: true }],
  ["unknown", { type: Ast.NONE, code: null, errorGenNeeded: true }],
  [
    "null",
    {
      type: Ast.EXPR,
      code: `(${TEMPLATE_VAR} === null)`,
      errorGenNeeded: true,
    },
  ],
  [
    "undefined",
    {
      type: Ast.EXPR,
      code: `(${TEMPLATE_VAR} === undefined)`,
      errorGenNeeded: true,
    },
  ],
  [
    "boolean",
    {
      type: Ast.EXPR,
      code: `(typeof ${TEMPLATE_VAR} === "boolean")`,
      errorGenNeeded: true,
    },
  ],
  [
    "number",
    {
      type: Ast.EXPR,
      code: `(typeof ${TEMPLATE_VAR} === "number")`,
      errorGenNeeded: true,
    },
  ],
  [
    "string",
    {
      type: Ast.EXPR,
      code: `(typeof ${TEMPLATE_VAR} === "string")`,
      errorGenNeeded: true,
    },
  ],
  [
    "object",
    {
      type: Ast.EXPR,
      code: `(typeof ${TEMPLATE_VAR} === "object" && ${TEMPLATE_VAR} !== null)`,
      errorGenNeeded: true,
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
// fastest method for validating whether an object is an array
// https://jsperf.com/instanceof-array-vs-array-isarray/38
// https://jsperf.com/is-array-safe
// without the !! the return value for p0 => p0 && p0.constructor with an input of undefined
// would be undefined instead of false
const IS_ARRAY = `(!!${TEMPLATE_VAR} && ${TEMPLATE_VAR}.constructor === Array)`;

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
    path: `"input"`, // TODO: Make this configurable
    underUnion: false,
  };
  const validator = visitIR(ir, state);
  if (isNonEmptyValidator(validator)) {
    return addHoistedFunctionsAndErrorReporting(validator, state, ir);
  }
  throw new MacroError(oneLine`You tried to generate a validator for a type that simplifies to "any", which is non-sensical because
                        a validator for an object of type any would always return true.`);
}

// This code is problematic because it relies on raw string manipulation/matching
// which means if (for example) unnecessary spaces are added so "(() =>" becomes "( () =>"
// then this code will not detect the unnecessary empty arrow function. The long term solution
// is to have 3 validator types:
// 1. NONE
// 2. expression (examples: x === 3 or f(x))
// 3. body, where bodies must be wrapped by the parent
// of course, this introduces extra complexity for the caller
// This function checks for p0 => (() => { ... })() and transforms it to
// p0 => { ... }
function removeEmptyArrowFunc(code: string): [boolean, string] {
  const emptyArrowFuncSignature = "(() =>";
  const emptyArrowFuncEnd = ")()";
  let didTransform = false;
  if (
    code.slice(0, emptyArrowFuncSignature.length) === emptyArrowFuncSignature &&
    code.slice(-emptyArrowFuncEnd.length) === emptyArrowFuncEnd
  ) {
    code = code.slice(
      emptyArrowFuncSignature.length,
      -emptyArrowFuncEnd.length
    );
    didTransform = true;
  }
  return [didTransform, code];
}

function addHoistedFunctionsAndErrorReporting(
  { code, errorGenNeeded }: Validator<Ast.EXPR>,
  state: State,
  ir: IR
) {
  const { hoistedTypes, instantiatedTypes, path } = state;
  const {
    opts: { errorMessages },
    parentParamName,
  } = state;
  const [didTransform, newCode] = removeEmptyArrowFunc(code);
  if (hoistedTypes.size === 0) {
    if (!errorMessages) {
      // if there are no error messages or hoisted types,
      // the body is just a giant boolean expression
      return `(${parentParamName}) => ${newCode}`;
    } else if (!errorGenNeeded) {
      return `(${parentParamName}, ${ERRORS_ARRAY}) => ${newCode}`;
    }
  }
  if (
    hoistedTypes.size === 0 &&
    (!errorMessages || (errorMessages && !errorGenNeeded))
  )
    return `(${state.parentParamName}${
      errorMessages ? `, ${ERRORS_ARRAY}` : ""
    }) => ${code}`;
  const hoistedFuncs: string[] = [];
  for (const [key, val] of hoistedTypes) {
    const pathParameter = "path";
    const { value: ir } = safeGet(key, instantiatedTypes);
    const hoistedFuncParams = `(x${val}${
      errorMessages ? `, ${pathParameter}` : ""
    })`;
    const funcCode = visitIR(ir, {
      ...state,
      path: pathParameter,
      parentParamName: `x${val}`,
    });
    if (funcCode.type === Ast.NONE) {
      throwUnexpectedError(
        `instantiated type: ${key} had empty validator but was hoisted anyway`
      );
    }
    const [, newHoistedCode] = removeEmptyArrowFunc(funcCode.code!!);
    hoistedFuncs.push(
      `const f${val} = ${hoistedFuncParams} => ${newHoistedCode};`
    );
  }
  const inlinableCode = didTransform
    ? // if we did remove an empty arrow function, then
      // the inside of the arrow function must have been a block statement
      // that returns a boolean value. We can remove the braces on the block
      // and inline it.
      newCode.slice(newCode.indexOf("{") + 1, -1)
    : // If there was no empty arrow function at the top level,
      // then the code was an expression that must be returned
      `return ${code}`;
  if (errorMessages) {
    return codeBlock`
    (${parentParamName}, ${ERRORS_ARRAY}) => {
      ${hoistedFuncs.join("\n")}
      ${
        errorGenNeeded
          ? codeBlock`
          ${wrapFalsyExprWithErrorReporter(
            "!" + "(" + code + ")",
            path,
            parentParamName,
            ir,
            Action.RETURN
          )}
          return true;`
          : inlinableCode
      }
    }
    `;
  }
  return codeBlock`
  ${parentParamName} => {
    ${hoistedFuncs.join("\n")}
    ${inlinableCode}
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
    paramValue,
    paramName,
    pathParamValue,
  }: {
    paramValue: T;
    paramName: T extends string ? string : null;
    pathParamValue?: string;
  },
  returnValue = Return.TRUE
): string => {
  // TODO: Probably de-duplicate this
  if (typeof paramValue === "string" && paramValue.length === 0) {
    throwUnexpectedError(`passed empty string to functionParamValue`);
  }
  if (typeof paramName === "string" && paramName.length === 0) {
    throwUnexpectedError(`passed empty string to insideFunctionParam`);
  }
  const body = `{
    ${code}
    return ${returnValue === Return.TRUE ? "true" : SUCCESS_FLAG}
  }`;
  if (paramValue && pathParamValue) {
    return `((${paramName}, ${PATH_PARAM}) => ${body})(${paramValue}, ${pathParamValue})`;
  } else if (paramValue) {
    return `((${paramName}) => ${body})(${paramValue})`;
  } else if (pathParamValue) {
    return `((${PATH_PARAM}) => ${body})(${pathParamValue})`;
  } else {
    return `(() => ${body})()`;
  }
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
  const {
    instantiatedTypes,
    typeStats,
    hoistedTypes,
    parentParamName,
    opts: { errorMessages },
    path,
  } = state;
  const { typeName } = ir;
  const occurrences = safeGet(typeName, typeStats);
  const instantiatedType = safeGet(typeName, instantiatedTypes);
  const { value } = instantiatedType;
  if (
    !(isPrimitive(value) || isLiteral(value) || isInstantiatedType(value)) &&
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
      code: `f${hoistedFuncIdx}(${parentParamName}${
        errorMessages ? `, ${path}` : ""
      })`,
      // TODO: Fix this up
      // This is fine?
      errorGenNeeded: false,
    };
  } else {
    return visitIR(value, state);
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

export function isParenthesized(code: string): boolean {
  let nestingLevel = 0;
  for (let i = 0; i < code.length; ++i) {
    const c = code[i];
    if (c === "(") {
      nestingLevel++;
    } else if (c === ")") {
      nestingLevel--;
      if (nestingLevel === 0 && i < code.length - 1) return false;
    }
  }
  if (nestingLevel !== 0)
    throwUnexpectedError(`code: "${code}" was not parenthesized properly`);
  return true;
}

function parenthesizeExpr(code: string): string {
  if (!isParenthesized(code)) {
    return "(" + code + ")";
  }
  return code;
}

function negateExpr(code: string): string {
  return "!" + parenthesizeExpr(code);
}

function generateArrayValidator(
  ir: BuiltinType<"Array">,
  state: State
): Validator<Ast.EXPR> {
  const { parentParamName, path } = state;
  const propertyVerifierParamName = getNewParam(parentParamName);
  const idxVar = getNewParam(propertyVerifierParamName);
  const loopElementName = getNewParam(idxVar);
  const propertyValidatorPath = addPaths(PATH_PARAM, `"[" + ${idxVar} + "]"`);
  const propertyValidator = visitIR(ir.elementTypes[0], {
    ...state,
    parentParamName: loopElementName,
    path: propertyValidatorPath,
  });
  const isErrorReporting = shouldReportErrors(state);
  const reportErrorsHere = isErrorReporting && propertyValidator.errorGenNeeded;

  let checkProperties = "";
  if (isNonEmptyValidator(propertyValidator)) {
    const manualLoopHeader = codeBlock`
              ${SETUP_SUCCESS_FLAG}
              for (let ${idxVar} = 0; ${idxVar} < ${propertyVerifierParamName}.length; ++${idxVar}) {
                const ${loopElementName} = ${propertyVerifierParamName}[${idxVar}];`;
    if (reportErrorsHere) {
      checkProperties = codeBlock`
      ${manualLoopHeader}
        ${wrapFalsyExprWithErrorReporter(
          negateExpr(propertyValidator.code),
          addPaths(PATH_PARAM, `"[" + ${idxVar} + "]"`),
          loopElementName,
          ir,
          Action.SET
        )}
      }
      `;
    } else if (isErrorReporting) {
      checkProperties = codeBlock`
      ${manualLoopHeader}
        if (${negateExpr(propertyValidator.code)}) ${SUCCESS_FLAG} = false;
      }
      `;
    } else {
      checkProperties = codeBlock`
      for (const ${loopElementName} of ${propertyVerifierParamName}) {
        if (${negateExpr(propertyValidator.code)}) return false;
      }`;
    }
  }

  let checkIfArray = template(IS_ARRAY, parentParamName);
  if (isErrorReporting) {
    checkIfArray = wrapFalsyExprWithErrorReporter(
      negateExpr(checkIfArray),
      path,
      parentParamName,
      ir,
      Action.RETURN
    );
  }

  let finalCode = checkIfArray;

  if (checkProperties) {
    if (isErrorReporting) {
      finalCode = wrapWithFunction(
        checkIfArray + checkProperties,
        {
          paramValue: parentParamName,
          paramName: propertyVerifierParamName,
          pathParamValue: path,
        },
        Return.ERROR_FLAG
      );
    } else {
      finalCode += `&& ${wrapWithFunction(
        checkProperties,
        {
          paramValue: parentParamName,
          paramName: propertyVerifierParamName,
        },
        Return.TRUE
      )}`;
    }
  } else if (reportErrorsHere) {
    finalCode = wrapWithFunction(
      finalCode,
      {
        paramName: propertyVerifierParamName,
        paramValue: parentParamName,
        pathParamValue: path,
      },
      Return.ERROR_FLAG
    );
  }

  return {
    type: Ast.EXPR,
    code: finalCode,
    errorGenNeeded: false,
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
      path: addPaths(state.path, `"[${i}]"`),
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
    errorGenNeeded: true,
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
      { paramName: null, paramValue: null }
    );
    return {
      type: Ast.EXPR,
      code: `${lengthCheckCode}${verifyNonRestElementsCode} && ${restElementValidatorCode}`,
      errorGenNeeded: true,
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
    errorGenNeeded: true,
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
        errorGenNeeded: true,
      };
  }

  // TODO: Have function called "merge" that takes a array of expressions (strings)
  // and either uses Array.join to either join them with the "||" or "&&" operator
  // Could replace a lot of this bullshit
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
    errorGenNeeded: true,
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
  const expr = parenthesizeExpr(
    template(validator.code, state.parentParamName)
  );
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

enum Action {
  RETURN,
  SET,
}

function wrapFalsyExprWithErrorReporter(
  code: string,
  fullPathExpr: string,
  actualExpr: string,
  expected: IR,
  action: Action
): string {
  return codeBlock`
    if (${code}) {
      ${ERRORS_ARRAY}.push([${fullPathExpr}, ${actualExpr}, ${stringify(
    expected
  )}]);
      ${action === Action.RETURN ? "return false" : `${SUCCESS_FLAG} = false`};
    }
    `;
}

function visitObjectPattern(node: ObjectPattern, state: State): Validator<Ast> {
  const { path, parentParamName: parentParam } = state;
  const { numberIndexerType, stringIndexerType, properties } = node;
  const keyName = getNewParam(parentParam);
  const valueName = getNewParam(keyName);
  let validateStringKeyCode = "";
  const indexerPathExpr = addPaths(
    PATH_PARAM,
    `"[" + JSON.stringify(${keyName}) + "]"`
  );
  const indexerState: State = {
    ...state,
    parentParamName: valueName,
    path: indexerPathExpr,
  };

  const stringValidator = stringIndexerType
    ? visitIR(stringIndexerType, indexerState)
    : null;
  if (stringValidator !== null && isNonEmptyValidator(stringValidator)) {
    const cond = `!(${stringValidator.code})`;
    if (shouldReportErrors(state) && stringValidator.errorGenNeeded) {
      validateStringKeyCode = wrapFalsyExprWithErrorReporter(
        cond,
        indexerPathExpr,
        valueName,
        stringIndexerType!!,
        Action.SET
      );
    } else {
      validateStringKeyCode = `if (${cond}) return false;`;
    }
  }
  let validateNumberKeyCode = "";
  const numberValidator = numberIndexerType
    ? visitIR(numberIndexerType, indexerState)
    : null;
  if (numberValidator !== null && isNonEmptyValidator(numberValidator)) {
    const cond = `(!isNaN(${keyName}) || ${keyName} === "NaN") && !${numberValidator.code}`;
    if (shouldReportErrors(state) && numberValidator.errorGenNeeded) {
      validateNumberKeyCode = wrapFalsyExprWithErrorReporter(
        cond,
        indexerPathExpr,
        valueName,
        numberIndexerType!!,
        Action.SET
      );
    } else {
      validateNumberKeyCode = `if (${cond}) return false;`;
    }
  }

  let indexValidatorCode = "";
  if (stringValidator || numberValidator) {
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
    const propertyPath = addPaths(path, JSON.stringify(`[${escapedKeyName}]`));
    const valueV = visitIR(value, {
      ...state,
      parentParamName: propertyAccess,
      path: propertyPath,
    });
    if (isNonEmptyValidator(valueV)) {
      let propertyTest = "";
      if (optional) {
        propertyTest = oneLine`(${propertyAccess} === undefined) || ${valueV.code}`;
      } else {
        // TODO: Add ad-hoc helpers so
        // the generated code is smaller
        propertyTest = oneLine`(Object.prototype.hasOwnProperty.call(
          ${parentParam}, ${escapedKeyName})) && ${valueV.code}`;
      }
      propertyTest = `(${propertyTest})`;
      if (shouldReportErrors(state) && valueV.errorGenNeeded) {
        propertyValidatorCode += wrapFalsyExprWithErrorReporter(
          "!" + propertyTest,
          propertyPath,
          propertyAccess,
          value,
          Action.SET
        );
      } else if (shouldReportErrors(state)) {
        propertyValidatorCode += `if(!${propertyTest}) ${SUCCESS_FLAG} = false;`;
      } else {
        propertyValidatorCode += i === 0 ? propertyTest : `&& ${propertyTest}`;
      }
    }
  }

  if (!indexValidatorCode && !propertyValidatorCode) {
    // no index or property signatures means it is just an empty object
    const isObjectV = getPrimitive("object");
    let isObjectCode;
    if (isNonEmptyValidator(isObjectV)) {
      isObjectCode = template(isObjectV.code, parentParam);
    } else {
      throwUnexpectedError(
        `did not find validator for "object" in primitives map`
      );
    }
    if (shouldReportErrors(state)) {
      isObjectCode = wrapFalsyExprWithErrorReporter(
        negateExpr(isObjectCode),
        path,
        parentParam,
        node,
        Action.SET
      );
    }
    return {
      type: Ast.EXPR,
      code: `${isObjectCode}`,
      errorGenNeeded: false,
    };
  }

  let finalCode = "";
  if (shouldReportErrors(state)) {
    const checkNotTruthyCode = wrapFalsyExprWithErrorReporter(
      negateExpr(parentParam),
      path,
      parentParam,
      node,
      Action.RETURN
    );
    if (indexValidatorCode) {
      finalCode = checkNotTruthyCode;
      finalCode += SETUP_SUCCESS_FLAG;
      finalCode += indexValidatorCode;
    }
    if (propertyValidatorCode) {
      if (indexValidatorCode) finalCode += propertyValidatorCode;
      else
        finalCode +=
          checkNotTruthyCode + SETUP_SUCCESS_FLAG + propertyValidatorCode;
    }
    finalCode = wrapWithFunction(
      finalCode,
      {
        //paramName: indexValidatorWrapperParam,
        //paramValue: parentParam,
        paramName: null,
        paramValue: null,
        pathParamValue: path,
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
          //paramName: indexValidatorWrapperParam,
          //paramValue: parentParam,
          paramName: null,
          paramValue: null,
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
    errorGenNeeded: false,
  };
}

function addPaths(expr1: string, expr2: string): string {
  if (expr1 === "") return expr2;
  return `${expr1} + ${expr2}`;
}
