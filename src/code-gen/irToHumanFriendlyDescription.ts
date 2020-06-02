import { html } from "common-tags";
import {
  IR,
  PrimitiveType,
  Union,
  ObjectPattern,
  InstantiatedType,
  Tuple,
  Literal,
  BuiltinType,
  BuiltinTypeName,
} from "../type-ir/IR";
import { MacroError } from "babel-plugin-macros";
import { throwMaybeAstError, throwUnexpectedError } from "../macro-assertions";
import { TypeInfo } from "../type-ir/passes/instantiate";
import { safeGet } from "../utils/checks";
import { isInstantiatedType } from "../type-ir/IRUtils";

interface State {
  typeName: string | undefined;
  instantiatedTypes: Map<string, TypeInfo>;
}

export function humanFriendlyDescription(ir: IR, state: State): string {
  return visitIR(ir, state);
}

export function visitIR(ir: IR, state: State): string {
  let visitorFunction: (ir: IR, state?: State) => string;
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
        `found failedIntersection while generating type description. This generally means you have an invalid intersection in your types.`
      );
    default:
      throwUnexpectedError(
        `unexpected ir type while generating type description: ${ir.type}`
      );
  }
  return visitorFunction(ir, state);
}

function visitPrimitiveType(ir: PrimitiveType): string {
  return "type: " + ir.typeName;
}

function stringify(val: string | number | boolean): string {
  return typeof val === "string" ? JSON.stringify(val) : val.toString();
}

function visitLiteral(ir: Literal): string {
  const { value } = ir;
  return "value: " + stringify(value);
}

function visitInstantiatedType(ir: InstantiatedType, state: State): string {
  const { typeName, instantiatedTypes } = state;
  if (ir.typeName === typeName) return "itself";
  const referencedIr = safeGet(ir.typeName, instantiatedTypes);
  const { value } = referencedIr;
  if (isInstantiatedType(value)) {
    return visitInstantiatedType(value, state);
  }
  return visitIR(value, state);
}

function visitObjectPattern(ir: ObjectPattern, state: State): string {
  const { properties, stringIndexerType, numberIndexerType } = ir;
  if (properties.length === 0 && !stringIndexerType && !numberIndexerType) {
    return "empty object";
  }
  let base = "object";
  // prettier-ignore
  const stringIndexerDescription = stringIndexerType
    ? html` 
    where all keys are: 
      ${visitIR(stringIndexerType, state)}
    `
    : null;
  // prettier-ignore
  const numberIndexerDescription = numberIndexerType
    ? html`
      where all numeric keys are${stringIndexerDescription !== null ? " also" : ""}:
        ${visitIR(numberIndexerType, state)}
      `
    : null;
  /*
  if (stringIndexerType) {
    base += ` where all keys are (${visitIR(stringIndexerType, state)})s`
  }
  if (numberIndexerType) {
    base += (stringIndexerType ? ' and ' : " where all numeric keys are ") + `${stringIndexerType ? 'also ': ""}(${visitIR(numberIndexerType, state)})s`
  }
  */
  if (stringIndexerDescription) {
    // prettier-ignore
    base = html`
    ${base}
      ${stringIndexerDescription}
    `;
  }
  if (numberIndexerDescription) {
    // prettier-ignore
    base = html`
    ${base} 
      ${numberIndexerDescription}
    `;
  }
  if (properties.length === 0) return base;
  // prettier-ignore
  return html`
    ${base} 
      with properties
        ${properties
          .map(
            (prop) => html`
              - ${stringify(prop.keyName)}${prop.optional ? ' (optional)' : ""}: 
                ${visitIR(prop.value, state)}
            `
          )
          .join("\n")}
   `;
}

function visitUnion(ir: Union, state: State): string {
  // prettier-ignore
  return html`
    At least one of:
      ${ir.childTypes.map((child) => `- ${visitIR(child, state)}`).join("\n")}
    `;
}

function visitTuple(ir: Tuple, state: State): string {
  const { childTypes, firstOptionalIndex, restType } = ir;
  const elements = childTypes.map(
    (child, idx) =>
      `- ${idx >= firstOptionalIndex ? "(optional) " : ""} ${visitIR(
        child,
        state
      )}`
  );
  if (restType) {
    elements.push(`- (rest type) ${visitIR(restType, state)}`);
  }
  // prettier-ignore
  return html`
  tuple:
    ${elements.join("\n")}
  `;
}

function visitBuiltinType(
  ir: BuiltinType<BuiltinTypeName>,
  state: State
): string {
  const { typeName, elementTypes } = ir;
  let description;
  if (typeName === "Array") {
    // prettier-ignore
    description = html`
    Array of 
      ${visitIR(elementTypes[0], state)} 
    `;
  } else {
    throw new MacroError(`Code gen for: ${ir.typeName} is not yet supported`);
  }
  return description;
}
