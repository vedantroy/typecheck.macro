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
} from "../type-ir/typeIR";
import { MacroError } from "babel-plugin-macros";
import { Errors } from "../macro-assertions";
import { codeBlock } from "common-tags";

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
]);

interface State {
  namedTypes: string[];
  // theoretically all anonymous validation functions
  // could use the same parameter "p", but we give them unique parameters
  // p0, p1, ... this prevents bugs from hiding due to shadowing
  // (we prefer an explicit crash in the validator, so the user of the library can report it)
  paramIdx: number;
}

export function generateValidator(ir: IR): string {
  const state: State = { namedTypes: [], paramIdx: 0 };
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
    default:
      // TODO: you know
      throw new MacroError(
        Errors.UnexpectedError(`TODO`, `unexpected ir type: ${ir.type}`)
      );
  }
  const validator = visitorFunction(ir, state);
  // Only functions have parameters
  if (validator.type !== Ast.FUNCTION) state.paramIdx -= 1;
  return visitorFunction(ir, state);
}

function visitPrimitiveType(
  ir: PrimitiveType
): Validator<Ast.NONE> | Validator<Ast.INLINE> {
  const { typeName } = ir;
  const validator = primitives.get(typeName);
  if (!validator) {
    throw new MacroError(
      Errors.UnexpectedError(`TODO`, `unexpected primitive type: ${typeName}`)
    );
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

const getParamName = (idx: number) => `p${idx}`;

function wrapWithFunction(code: string, paramName: string): string {
  return codeBlock`
  ${paramName} => {
    ${code}
  }`;
}

function visitObjectPattern(node: ObjectPattern, state: State): Validator<Ast> {
  const { numberIndexer, stringIndexer, properties } = node;
  const paramName = getParamName(state.paramIdx);
  const destructuredKeyName = "v";
  let validateStringKeyCode = "";
  // s = string
  const sV = stringIndexer ? visitIR(stringIndexer, state) : null;
  if (sV !== null && isNonEmptyValidator(sV)) {
    validateStringKeyCode = codeBlock`
      if (!${wrapValidator(sV, destructuredKeyName)}}) {
        return false;
      }
      `;
  }
  let validateNumberKeyCode = "";
  // n = number
  const nV = numberIndexer ? visitIR(numberIndexer, state) : null;
  if (nV !== null && isNonEmptyValidator(nV)) {
    validateNumberKeyCode = codeBlock`
      if (!isNan(${paramName} && !${wrapValidator(nV, destructuredKeyName)}}) {
        return false;
      }
      `;
  }

  let indexValidatorCode = "";
  if (sV || nV) {
    indexValidatorCode = codeBlock`
    for (const [k, ${destructuredKeyName}] of Object.entries(${paramName})) {
      ${validateStringKeyCode}${validateNumberKeyCode}
    }
    `;
  }

  let propertyValidatorCode = "";
  for (const prop of properties) {
    const { keyName, optional, value } = prop;
    const valueV = visitIR(value, state);
    if (isNonEmptyValidator(valueV)) {
      let code = "";
      const valueVCode = wrapValidator(valueV, `${paramName}.${keyName}`);
      if (optional) {
        // TODO: Add ad-hoc helpers so
        // the generate code is smaller
        // prettier-ignore
        code = codeBlock`
        if (Object.prototype.hasOwnProperty.call("${keyName}") && !${valueVCode}) {
            return false;
        }
        `;
      } else {
        code = codeBlock`
        if (!Object.property.hasOwnProperty.call("${keyName}") || !${valueVCode}) {
          return false;
        }
        `;
      }
      propertyValidatorCode += code;
    }
  }

  return {
    type: Ast.FUNCTION,
    code: wrapWithFunction(
      `${indexValidatorCode}${propertyValidatorCode}`,
      paramName
    ),
  };
}
