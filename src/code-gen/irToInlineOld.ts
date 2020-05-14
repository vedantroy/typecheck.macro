import { IR, ObjectPattern, PrimitiveTypeName, Type } from "../type-ir/typeIR";
import { createErrorThrower, Errors } from "../macro-assertions";
import { codeBlock } from "common-tags";

const builtinTypeValidators: Map<
  PrimitiveTypeName,
  (x: any, varName: string) => boolean
> = new Map();
const registeredTypeValidators: Map<string, string> = new Map();

// META: Should we not validate object style primitives?
// META: Is it slow to throw an error?
// TODO: How to have var names? This must be possible
builtinTypeValidators.set("boolean", function (x, varName) {
  if (x === false || x === true || x instanceof Boolean) return true;
  //throw Error(`${varName} had non-boolean value: ${x}`);
  throw Error(`missing boolean value: ${x}`);
});

builtinTypeValidators.set("number", function (x, varName) {
  // TODO: figure out the object version
  // Should we use Number.isFinite?
  if (typeof x === "number") return true;
  throw Error(`missing number value: ${x}`);
});

builtinTypeValidators.set("string", function (x, varName) {
  // https://stackoverflow.com/questions/1303646/check-whether-variable-is-number-or-string-in-javascript
  if (
    typeof x === "string" ||
    (typeof x === "object" && x["constructor"] === String)
  )
    return true;
  throw Error(`missing string value: ${x}`);
});

const throwUnexpectedError: (message: string) => never = createErrorThrower(
  visitIR.name,
  Errors.UnexpectedError
);

interface State {
  // Top level state for the entire IR schema

  // stores validators for uniquely named types
  // "string", "number", user defined types
  namedTypeValidators: Map<string, string>;
  genFirstLine: boolean;

  // State for each function that is being generated

  // add a line of code to the current function
  addLine: (line: string) => void;
  // the name of the variable to call the current validator function with
  // technically not needed if we name every parameter x
  paramName: string;
}

// Generates a function to validate an entire IR scheme
export function fullIRToInline(ir: IR): string {
  const namedTypeValidators: Map<string, string> = new Map();
  const validatorCode = irToInline(ir, {
    namedTypeValidators,
    addLine: (_) => {
      throwUnexpectedError(`the default addLine function was called`);
    },
    paramName: "x",
    genFirstLine: false,
  });
  let namedValidorCode = ``;
  for (const [funcName, code] of namedTypeValidators.entries()) {
    namedValidorCode += `const __$$${funcName} = ${code}\n`;
  }
  return `
  (x => {
    ${namedValidorCode}
    ${validatorCode}
  `;
}

// Generates a function to validate a single type
export function irToInline(ir: IR, state: State): string {
  let code = ``;
  const addLine = (line: string) => {
    if (line.slice(-1) !== "\n") line += "\n";
    code += line;
  };
  // reset addLine because we are creating a new function with new code
  state.addLine = addLine;
  if (state.genFirstLine) {
    addLine(`(${state.paramName} => {`);
  }
  state.genFirstLine = true;
  visitIR(ir, state);
  code += `})`;
  return code;
}

function visitIR(ir: IR, state: State): void {
  // There are a lot of casts in this function
  // because we are assuming the ir is properly generated
  // in the long run, it will be better to auto generate validation functions
  // that validate the ir
  let visitorFunction: (ir: IR, state: State) => string | void;
  // The following types are not in the switch:
  // indexSignature, propertySignature
  // because they are handled in another visitor
  switch (ir.type) {
    case "type":
      visitorFunction = visitType;
      break;
    case "objectPattern":
      visitorFunction = visitObjectPattern;
      break;
    case "literal":
    case "reference":
    case "union":
    default:
      throwUnexpectedError(`Unhandled ir node: ${ir.type}`);
  }
  visitorFunction(ir, state);
}

function visitType(node: Type, state: State): void {
  const { namedTypeValidators, paramName, addLine } = state;
  const { typeName } = node;
  if (!namedTypeValidators.has(typeName)) {
    const builtinValidator = builtinTypeValidators.get(
      typeName as PrimitiveTypeName
    );
    if (builtinValidator !== undefined) {
      namedTypeValidators.set(typeName, builtinValidator.toString());
    } else if (registeredTypeValidators.has(typeName)) {
      namedTypeValidators.set(
        typeName,
        registeredTypeValidators.get(typeName) as string
      );
    } else {
      throwUnexpectedError(`Adding external types is not yet supported`);
    }
  }
  addLine(`__$$${typeName}(${paramName})`);
}

function visitObjectPattern(node: ObjectPattern, state: State) {
  const { addLine, paramName } = state;
  const { numberIndexer, stringIndexer } = node;
  if (node.stringIndexer || node.numberIndexer) {
    addLine(
      codeBlock`
      for (const [k, v] of Object.entries(${paramName})) {
        ${(() => {
          const newState = { ...state, paramName: "v" };
          let code = ``;
          if (stringIndexer) {
            code += irToInline(stringIndexer.value, newState) + "(v)\n";
          }
          if (numberIndexer) {
            code += codeBlock`
            if (!isNan(k)) {
              ${irToInline(numberIndexer.value, newState)}(v)
            }
            `;
          }
          return code;
        })()}
      }
      `
    );
  }
}
