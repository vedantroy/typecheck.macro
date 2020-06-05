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
import {
  isInstantiatedType,
  isLiteral,
  isPrimitive,
  isUnion,
  isAnyOrUnknown,
} from "../type-ir/IRUtils";
import { TypeInfo } from "../type-ir/passes/instantiate";
import { safeGet } from "../utils/checks";
import { humanFriendlyDescription } from "./irToHumanFriendlyDescription";

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

const VIS_PARAM = "vis";

const PATH_PARAM = "$path";
const TOP_LEVEL_PATH_PARAM = "$$path";

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

// these should be configurable
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
  readonly circularRefs: boolean;
  readonly expectedValueAsIR: boolean;
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
  readonly typeName?: string;
}

// NOT THREAD SAFE GLOBAL STATE
let postfixIdx: number;
let errorsAsIR: boolean;

export const getUniqueVar = () => {
  return `p${postfixIdx++}`;
};

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
  postfixIdx = 0;
  errorsAsIR = options.expectedValueAsIR;
  const state: State = {
    opts: options,
    hoistedTypes: new Map(),
    instantiatedTypes,
    typeStats,
    parentParamName: getUniqueVar(),
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
    opts: { errorMessages, circularRefs },
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
    let { value: ir, circular } = safeGet(key, instantiatedTypes);
    if (!circularRefs) circular = false;
    const param = getUniqueVar();
    const hoistedFuncParams = `(${param} ${
      errorMessages || circular
        ? `, {${circular ? `${VIS_PARAM} = new Set(),` : ""}${
            errorMessages ? `${TOP_LEVEL_PATH_PARAM} = null` : ""
          }} = {}`
        : ""
    })`;
    const funcV = visitIR(ir, {
      ...state,
      path: TOP_LEVEL_PATH_PARAM,
      parentParamName: param,
      typeName: key,
    });
    if (funcV.type === Ast.NONE) {
      throwUnexpectedError(
        `instantiated type: ${key} had empty validator but was hoisted anyway`
      );
    }
    const funcCode = funcV.code!!;
    const reportErrorsHere = errorMessages && funcV.errorGenNeeded;
    const withErrorReporting = reportErrorsHere
      ? wrapFalsyExprWithErrorReporter(
          negateExpr(funcCode),
          TOP_LEVEL_PATH_PARAM,
          param,
          ir,
          Action.RETURN,
          { typeName: key, instantiatedTypes }
        ) + "\nreturn true;"
      : null;
    if (circular) {
      const code = reportErrorsHere ? withErrorReporting : `return ${funcCode}`;
      hoistedFuncs.push(
        codeBlock`
          const f${val} = ${hoistedFuncParams} => {
            if (${VIS_PARAM}.has(${param})) return true;
            ${VIS_PARAM}.add(${param});
            ${code}
          }
        `
      );
    } else {
      const [, newHoistedCode] = removeEmptyArrowFunc(funcV.code!!);
      const code = reportErrorsHere
        ? "{" + withErrorReporting + "}"
        : newHoistedCode;
      hoistedFuncs.push(`const f${val} = ${hoistedFuncParams} => ${code};`);
    }
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
            Action.RETURN,
            { typeName: undefined, instantiatedTypes }
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
  FLAG,
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
    opts: { circularRefs },
    path,
    typeName,
  } = state;
  const { typeName: nextTypeName } = ir;
  const occurrences = safeGet(nextTypeName, typeStats);
  const instantiatedType = safeGet(nextTypeName, instantiatedTypes);
  const { value } = instantiatedType;
  if (
    !(isPrimitive(value) || isLiteral(value) || isInstantiatedType(value)) &&
    (occurrences > 1 || instantiatedType.circular)
  ) {
    let hoistedFuncIdx;
    if (hoistedTypes.has(nextTypeName)) {
      hoistedFuncIdx = safeGet(nextTypeName, hoistedTypes);
    } else {
      hoistedFuncIdx = hoistedTypes.size;
      hoistedTypes.set(nextTypeName, hoistedFuncIdx);
    }
    const isCircularRef = nextTypeName === typeName && circularRefs;
    const reportErrors = shouldReportErrors(state);
    return {
      type: Ast.EXPR,
      code: `f${hoistedFuncIdx}(${parentParamName}${
        isCircularRef || reportErrors
          ? `, {${isCircularRef ? `${VIS_PARAM},` : ""}${
              reportErrors ? `${TOP_LEVEL_PATH_PARAM}: ${path}` : ""
            }}`
          : ""
      })`,
      // No error gen needed -- hoisted functions functions always have their
      // own error generation
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
    case "Set":
      validator = generateSetValidator(ir as BuiltinType<"Set">, state);
      break;
    case "Map":
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
  let hasParenthesis = false;
  for (let i = 0; i < code.length; ++i) {
    const c = code[i];
    if (c === "(") {
      nestingLevel++;
      hasParenthesis = true;
    } else if (c === ")") {
      nestingLevel--;
      if (nestingLevel === 0 && i < code.length - 1) return false;
    }
  }
  if (nestingLevel !== 0)
    throwUnexpectedError(`code: "${code}" was not parenthesized properly`);
  return hasParenthesis;
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

function generateValidatorForIterable(
  {
    loopHeader,
    booleanLoopHeader = null,
    guardExprTemplate,
    iterableName,
    elements,
    iterableIR,
  }: {
    loopHeader: string;
    booleanLoopHeader?: string | null;
    elements: Array<{ elementName: string; pathModifier: string; ir: IR }>;
    iterableIR: IR;
    iterableName: string;
    guardExprTemplate: string;
  },
  state: State
): Validator<Ast.EXPR> {
  const { parentParamName, path, typeName, instantiatedTypes } = state;
  let mustCheckElements = false;
  const elementValidators = elements.map(
    ({ elementName, pathModifier, ir }) => {
      const validator = visitIR(ir, {
        ...state,
        parentParamName: elementName,
        path: addPaths(path, pathModifier),
      });
      if (isNonEmptyValidator(validator)) mustCheckElements = true;
      return validator;
    }
  );
  const isErrorReporting = shouldReportErrors(state);

  let checkElements = "";
  if (mustCheckElements) {
    if (isErrorReporting) {
      checkElements = codeBlock`
      ${SETUP_SUCCESS_FLAG}
      ${loopHeader}
        ${elementValidators.map((v, idx) => {
          if (isNonEmptyValidator(v)) {
            if (v.errorGenNeeded) {
              return wrapFalsyExprWithErrorReporter(
                negateExpr(v.code),
                addPaths(path, elements[idx].pathModifier),
                elements[idx].elementName,
                elements[idx].ir,
                Action.SET,
                { typeName, instantiatedTypes }
              );
            }
            return `if (${negateExpr(v.code)}) ${SUCCESS_FLAG} = false;`;
          }
          return "";
        })}
      }`;
    } else {
      checkElements = codeBlock`
      ${booleanLoopHeader || loopHeader}
        ${elementValidators.map((v) => {
          if (isNonEmptyValidator(v)) {
            return `if (${negateExpr(v.code)}) return false;`;
          }
          return "";
        })}
      }`;
    }
  }
  let guardCode = null;
  if (isErrorReporting) {
    guardCode = wrapFalsyExprWithErrorReporter(
      negateExpr(template(guardExprTemplate, iterableName)),
      path,
      parentParamName,
      iterableIR,
      Action.RETURN,
      { typeName, instantiatedTypes }
    );
  } else {
    guardCode = template(guardExprTemplate, parentParamName);
  }

  let finalCode = guardCode;

  if (checkElements) {
    if (isErrorReporting) {
      finalCode = wrapWithFunction(
        guardCode + checkElements,
        {
          paramValue: parentParamName,
          paramName: iterableName,
        },
        Return.FLAG
      );
    } else {
      finalCode += `&& ${wrapWithFunction(
        checkElements,
        {
          paramValue: parentParamName,
          paramName: iterableName,
        },
        Return.TRUE
      )}`;
    }
  } else if (isErrorReporting) {
    finalCode = wrapWithFunction(
      finalCode,
      {
        paramName: iterableName,
        paramValue: parentParamName,
      },
      Return.TRUE
    );
  }

  return {
    type: Ast.EXPR,
    code: finalCode,
    errorGenNeeded: false,
  };
}

function generateSetValidator(
  ir: BuiltinType<"Set">,
  state: State
): Validator<Ast.EXPR> {
  const wrapperFunctionParamName = getUniqueVar();
  const elementName = getUniqueVar();
  return generateValidatorForIterable(
    {
      loopHeader: `for (const ${elementName} of ${wrapperFunctionParamName}) {`,
      elements: [
        { elementName, ir: ir.elementTypes[0], pathModifier: ".SET_ELEMENT" },
      ],
      iterableIR: ir,
      iterableName: wrapperFunctionParamName,
      // TODO: Jsbench this
      guardExprTemplate: `!!${TEMPLATE_VAR} && ${TEMPLATE_VAR}.constructor === Set`,
    },
    state
  );
}

function generateArrayValidator(
  ir: BuiltinType<"Array">,
  state: State
): Validator<Ast.EXPR> {
  const wrapperFunctionParamName = getUniqueVar();
  const elementName = getUniqueVar();
  const idxVar = getUniqueVar();
  return generateValidatorForIterable(
    {
      loopHeader: codeBlock`for (let ${idxVar} = 0; ${idxVar} < ${wrapperFunctionParamName}.length; ++${idxVar}) {
                              const ${elementName} = ${wrapperFunctionParamName}[${idxVar}];
                          `,
      booleanLoopHeader: `for (const ${elementName} of ${wrapperFunctionParamName}) {`,
      elements: [
        {
          elementName,
          ir: ir.elementTypes[0],
          pathModifier: `"[" + ${idxVar} + "]"`,
        },
      ],
      iterableIR: ir,
      iterableName: wrapperFunctionParamName,
      guardExprTemplate: `!!${TEMPLATE_VAR} && ${TEMPLATE_VAR}.constructor === Array`,
    },
    state
  );
}

function visitTuple(ir: Tuple, state: State): Validator<Ast.EXPR> {
  const {
    parentParamName: parameterName,
    path,
    typeName,
    instantiatedTypes,
  } = state;
  const isErrorReporting = shouldReportErrors(state);
  const { childTypes, firstOptionalIndex, restType, undefinedOptionals } = ir;
  let lengthCheckCode = `${template(IS_ARRAY, parameterName)}`;

  if (firstOptionalIndex === childTypes.length) {
    lengthCheckCode += `&& ${parameterName}.length ${restType ? ">" : "="}=${
      restType ? "" : "="
    } ${childTypes.length}`;
  } else if (restType) {
    lengthCheckCode += `&& ${parameterName}.length >= ${firstOptionalIndex}`;
  } else {
    lengthCheckCode += `&& ${parameterName}.length >= ${firstOptionalIndex} && ${parameterName}.length <= ${childTypes.length}`;
  }

  if (isErrorReporting) {
    lengthCheckCode = wrapFalsyExprWithErrorReporter(
      negateExpr(lengthCheckCode),
      path,
      parameterName,
      ir,
      Action.RETURN,
      { typeName, instantiatedTypes }
    );
  }

  let verifyNonRestElementsCode = ``;
  for (let i = 0; i < childTypes.length; ++i) {
    // TODO: Can we optimize this so once we hit the array length, we don't perform the rest of the boolean operations
    // Maybe with a switch? What we really need is goto...
    const arrayAccessCode = `${parameterName}[${i}]`;
    const elementPath = addPaths(state.path, `"[${i}]"`);
    const elementValidator = visitIR(childTypes[i], {
      ...state,
      parentParamName: arrayAccessCode,
      path: elementPath,
    });
    if (elementValidator.type === Ast.NONE) continue;
    const { code: validationCode } = elementValidator;
    verifyNonRestElementsCode += " ";
    let code: string;
    if (i < firstOptionalIndex) {
      code = validationCode!!;
    } else {
      code = `((${i} < ${parameterName}.length && (${validationCode} ${
        undefinedOptionals ? `|| ${arrayAccessCode} === undefined` : ""
      })) || ${i} >= ${parameterName}.length)`;
    }
    if (isErrorReporting) {
      if (elementValidator.errorGenNeeded) {
        code = wrapFalsyExprWithErrorReporter(
          negateExpr(code),
          elementPath,
          arrayAccessCode,
          childTypes[i],
          Action.SET,
          { typeName, instantiatedTypes }
        );
      } else {
        code = codeBlock`if(${negateExpr(code)}) ${SUCCESS_FLAG} = false;`;
      }
      verifyNonRestElementsCode += code;
    } else {
      verifyNonRestElementsCode += "&&" + code;
    }
  }

  let code = lengthCheckCode;
  if (isErrorReporting) {
    code += SETUP_SUCCESS_FLAG;
  }
  code += verifyNonRestElementsCode;

  const noRestElementValidator: Validator<Ast.EXPR> = {
    type: Ast.EXPR,
    code: isErrorReporting
      ? wrapWithFunction(
          code,
          { paramName: null, paramValue: null },
          Return.FLAG
        )
      : code,
    errorGenNeeded: false,
  };

  if (restType === undefined) {
    return noRestElementValidator;
  } else {
    const indexVar = getUniqueVar();
    const restTypePath = addPaths(path, `"[" + ${indexVar} + "]"`);
    const restTypeParam = `${parameterName}[${indexVar}]`;
    const restTypeValidator = visitIR(restType, {
      ...state,
      parentParamName: restTypeParam,
      path: restTypePath,
    });
    if (restTypeValidator.type === Ast.NONE) return noRestElementValidator;
    const { errorGenNeeded } = restTypeValidator;
    const expr = negateExpr(restTypeValidator.code!!);
    let restElementValidatorCode;
    const HEADER = codeBlock`
        let ${indexVar} = ${childTypes.length};
        while (${indexVar} < ${parameterName}.length) {
    `;
    const FOOTER = codeBlock`
          ${indexVar}++
        }
    `;
    if (isErrorReporting) {
      restElementValidatorCode = codeBlock`
        ${HEADER}
          ${
            errorGenNeeded
              ? wrapFalsyExprWithErrorReporter(
                  expr,
                  restTypePath,
                  restTypeParam,
                  restType,
                  Action.SET,
                  { typeName, instantiatedTypes }
                )
              : `if (${expr}) ${SUCCESS_FLAG} = false;`
          }
        ${FOOTER}
        `;
      return {
        type: Ast.EXPR,
        code: wrapWithFunction(
          code + restElementValidatorCode,
          { paramName: null, paramValue: null },
          Return.FLAG
        ),
        errorGenNeeded: false,
      };
    } else {
      restElementValidatorCode = wrapWithFunction(
        codeBlock`
        ${HEADER}
          if (${expr}) return false;
        ${FOOTER}
        `,
        { paramName: null, paramValue: null }
      );
      return {
        type: Ast.EXPR,
        code: `${lengthCheckCode}${verifyNonRestElementsCode} && ${restElementValidatorCode}`,
        errorGenNeeded: false,
      };
    }
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
  action: Action,
  state: {
    typeName: string | undefined;
    instantiatedTypes: Map<string, TypeInfo>;
  }
): string {
  const actionCode =
    (action === Action.RETURN ? "return false" : `${SUCCESS_FLAG} = false`) +
    ";";
  const errorsCode = `${ERRORS_ARRAY}.push([${fullPathExpr}, ${actualExpr}, ${
    errorsAsIR
      ? stringify(expected)
      : JSON.stringify(humanFriendlyDescription(expected, state))
  }]);`;
  return state.typeName !== undefined
    ? codeBlock`
  if (${code}) {
    if (${TOP_LEVEL_PATH_PARAM} !== null) ${errorsCode}
    ${actionCode}
  }
  `
    : codeBlock`
    if (${code}) {
      ${errorsCode}
      ${actionCode}
    }
    `;
}

function visitObjectPattern(node: ObjectPattern, state: State): Validator<Ast> {
  const {
    path,
    parentParamName: parentParam,
    typeName,
    instantiatedTypes,
  } = state;
  const { numberIndexerType, stringIndexerType, properties } = node;
  const keyName = getUniqueVar();
  const valueName = getUniqueVar();
  let validateStringKeyCode = "";
  const indexerPathExpr = addPaths(
    path,
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
        Action.SET,
        { typeName, instantiatedTypes }
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
    const cond = `(!isNaN(${keyName}) || ${keyName} === "NaN") && ${negateExpr(
      numberValidator.code
    )}`;
    if (shouldReportErrors(state) && numberValidator.errorGenNeeded) {
      validateNumberKeyCode = wrapFalsyExprWithErrorReporter(
        cond,
        indexerPathExpr,
        valueName,
        numberIndexerType!!,
        Action.SET,
        { typeName, instantiatedTypes }
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
        if (canBeUndefined(value, instantiatedTypes)) {
          propertyTest = valueV.code;
        } else {
          propertyTest = oneLine`(${propertyAccess} === undefined) || ${valueV.code}`;
        }
      } else {
        // TODO: Add ad-hoc helpers so
        // the generated code is smaller
        propertyTest = valueV.code;
        if (canBeUndefined(value, instantiatedTypes)) {
          propertyTest =
            oneLine`(Object.prototype.hasOwnProperty.call(${parentParam}, ${escapedKeyName})) &&` +
            propertyTest;
        }
      }
      propertyTest = `(${propertyTest})`;
      if (shouldReportErrors(state) && valueV.errorGenNeeded) {
        propertyValidatorCode += wrapFalsyExprWithErrorReporter(
          "!" + propertyTest,
          propertyPath,
          propertyAccess,
          value,
          Action.SET,
          { typeName, instantiatedTypes }
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
        Action.SET,
        { typeName, instantiatedTypes }
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
      Action.RETURN,
      { typeName, instantiatedTypes }
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
        paramName: null,
        paramValue: null,
      },
      Return.FLAG
    );
  } else {
    const checkNotTruthy = `!!${parentParam}`;
    finalCode += `(`;
    if (indexValidatorCode) {
      // need checkTruthy so Object.entries doesn't crash
      finalCode += `${checkNotTruthy} && ${wrapWithFunction(
        indexValidatorCode,
        {
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

function canBeUndefined(
  ir: IR,
  instantiatedTypes: Map<string, TypeInfo>
): boolean {
  // 3 cases
  // 1. primitive type: undefined, any, unknown
  // 2. union with undefined subtype
  // 3. instantiatedType that fits into one of the 2 above cases
  if ((isPrimitive(ir) && ir.typeName === "undefined") || isAnyOrUnknown(ir))
    return true;
  if (isUnion(ir) && ir.hasUndefined) return true;
  if (isInstantiatedType(ir)) {
    const { value } = safeGet(ir.typeName, instantiatedTypes);
    return canBeUndefined(value, instantiatedTypes);
  }
  return false;
}

function addPaths(expr1: string, expr2: string): string {
  if (expr1 === "") return expr2;
  return `${expr1} + ${expr2}`;
}
