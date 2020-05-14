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
} from "../type-ir/typeIR";
import { MacroError } from "babel-plugin-macros";
import { Errors, throwUnexpectedError } from "../macro-assertions";
import { codeBlock, oneLine } from "common-tags";
import deepCopy from "fast-copy";

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
  readonly namedTypes: ReadonlyMap<string, IR>;
  referencedTypeNames: string[];
  // theoretically all anonymous validation functions
  // could use the same parameter "p", but we give them unique parameters
  // p0, p1, ... this prevents bugs from hiding due to shadowing
  // (we prefer an explicit crash in the validator, so the user of the library can report it)
  paramIdx: number;
}

export function generateValidator(
  ir: IR,
  namedTypes: ReadonlyMap<string, IR>
): string {
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

function assertAcceptsGenericParameters(
  ir: IR,
  typeName: string
): asserts ir is Interface {
  if (ir.type !== "interface") {
    // TODO: Stick this in errors, so we can test this as a compile error
    throw new MacroError(oneLine`Tried to instantiate "${typeName}"
                         with generic parameters even though ${ir.type}s don't accept generic parameters`);
  }
}

function isGenericType(val: any): val is GenericType {
  return (
    Object.prototype.hasOwnProperty.call(val, "type") &&
    val.type === "genericType"
  );
}

function isIR(val: any): val is IR {
  return (
    Object.prototype.hasOwnProperty.call(val, "type") &&
    typeof val.type === "string"
  );
}

function replaceGenerics(
  ir: IR,
  replacer: (typeParameterIndex: number) => IR
): void {
  for (const [key, val] of Object.entries(ir)) {
    if (isGenericType(val)) {
      // TODO: Do we just ts-ignore, or is there a solution?
      // Check your SO post
      ir[key] = replacer(val.genericParameterIndex);
    } else if (Array.isArray(val)) {
      for (let i = 0; i < val.length; ++i) {
        const element = val[i];
        if (isGenericType(element)) {
          val[i] = replacer(element.genericParameterIndex);
        } else if (isIR(element)) {
          replaceGenerics(element, replacer);
        }
      }
    }
  }
}

function visitType(ir: Type, state: State): Validator<Ast> {
  const { namedTypes } = state;
  const { typeName, genericParameters } = ir;
  const typeIr = namedTypes.get(typeName);
  if (typeIr === undefined) {
    throw new MacroError(Errors.UnregisteredType(typeName));
  }
  if (!genericParameters) {
    return visitIR(typeIr, state);
  }
  assertAcceptsGenericParameters(typeIr, typeName);
  // TODO: rename this to typeParameters, like in Babel
  const { genericParameterDefaults } = typeIr;
  if (genericParameterDefaults.length < genericParameters.length) {
    // TODO: Stick this in errors, so we can test this as a compile error
    throw new MacroError(
      oneLine`Tried to instantiate ${typeName} with ${genericParameters.length} type parameters
      even though it only accepts ${genericParameterDefaults.length}`
    );
  }

  const resolvedParameterValues: IR[] = [];
  for (let i = 0; i < genericParameterDefaults.length; ++i) {
    const defaultValue = deepCopy(genericParameterDefaults[i]);
    if (i < genericParameters.length) {
      resolvedParameterValues.push(genericParameters[i]);
    } else {
      if (defaultValue === null) {
        // TODO: We should just represent this in the IR
        // It's preferable to make the IR stricter
        // TODO: stick this in errors
        throw new MacroError(
          oneLine`Tried to instantiate ${typeName} with ${
            genericParameters.length
          } parameters even though it requires at least ${
            genericParameterDefaults.filter((p) => p === null).length
          }`
        );
      }
      replaceGenerics(defaultValue, (typeParameterIdx) => {
        // TODO: Can add macro error here for out of bounds exception
        return resolvedParameterValues[typeParameterIdx];
      });
      resolvedParameterValues.push(defaultValue);
    }
  }
  // After this, we get an instantiated generic, which we store in a map, idk
  // we should only deepCopy the relevant fields (interface | typealias)
  // interfaces can just be stored as objectPattern, typeAlias will be stored
  //as a generic IR node
  /*
  replaceGenerics(deepCopy(typeIr), typeParameterIdx => {
    return resolvedParameterValues[typeParameterIdx]
  })
  */
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
  const { numberIndexer, stringIndexer, properties } = node;
  const paramName = getParamName(state.paramIdx);
  const destructuredKeyName = "v";
  let validateStringKeyCode = "";
  // s = string
  const sV = stringIndexer ? visitIR(stringIndexer.value, state) : null;
  if (sV !== null && isNonEmptyValidator(sV)) {
    validateStringKeyCode = `if (!${wrapValidator(
      sV,
      destructuredKeyName
    )}) { return false; }`;
  }
  let validateNumberKeyCode = "";
  // n = number
  const nV = numberIndexer ? visitIR(numberIndexer.value, state) : null;
  if (nV !== null && isNonEmptyValidator(nV)) {
    validateNumberKeyCode = `if (!isNan(${paramName}) && !${wrapValidator(
      nV,
      destructuredKeyName
    )}) { return false; }`;
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
        code = `if (Object.prototype.hasOwnProperty.call("${keyName}") && !${valueVCode}) { return false; }`;
      } else {
        code = `if (!Object.prototype.hasOwnProperty.call("${keyName}") || !${valueVCode}) { return false; }`;
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
