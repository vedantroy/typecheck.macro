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
  NonExistentKey,
} from "../type-ir/IR";
import { MacroError } from "babel-plugin-macros";
import { throwMaybeAstError, throwUnexpectedError } from "../macro-assertions";
import { TypeInfo } from "../type-ir/passes/instantiate";
import { safeGet } from "../utils/checks";
import {
  isInstantiatedType,
  assertObjectPattern,
  isObjectPattern,
  isTuple,
  isUnion,
} from "../type-ir/IRUtils";

interface PartialState {
  typeName: string | undefined;
  instantiatedTypes: Map<string, TypeInfo>;
}

interface State extends PartialState {
  circularRefs: Map<string, number>;
  circularMark?: number;
}

export function humanFriendlyDescription(ir: IR, state: PartialState): string {
  const { typeName, instantiatedTypes } = state;
  const circularRefs = new Map<string, number>(
    typeName && safeGet(typeName, instantiatedTypes).circular
      ? [[typeName, 0]]
      : []
  );
  const circularMark = circularRefs.size === 1 ? 0 : undefined;
  return visitIR(ir, { ...state, circularRefs, circularMark });
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
    case "nonExistentKey":
      visitorFunction = visitNonExistentKey;
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

function visitNonExistentKey(ir: NonExistentKey): string {
  return "unexpected key that was not in original type";
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
  const { instantiatedTypes, circularRefs } = state;
  const { typeName } = ir;
  if (circularRefs.has(typeName)) {
    return `ref: #${safeGet(typeName, circularRefs)}`;
  }
  const referencedIr = safeGet(typeName, instantiatedTypes);
  const { value, circular } = referencedIr;
  if (circular) {
    if (!isObjectPattern(value) && !isUnion(value)) {
      throwUnexpectedError(
        `Human-friendly type descriptions are not possible for circular types that are not objects or unions. Please contact me, I didn't know this was possible!`
      );
    }
    circularRefs.set(typeName, circularRefs.size);
    state.circularMark = circularRefs.size - 1;
  }
  if (isInstantiatedType(value)) {
    if (circular)
      throwUnexpectedError(
        `found circular instantiated type that only referenced another instantiated type`
      );
    return visitInstantiatedType(value, state);
  }
  return visitIR(value, state);
}

function stringifyRef(id: number): string {
  return `(id: #${id})`;
}

function visitObjectPattern(ir: ObjectPattern, state: State): string {
  const { properties, stringIndexerType, numberIndexerType } = ir;
  if (properties.length === 0 && !stringIndexerType && !numberIndexerType) {
    return "empty object";
  }
  const { circularMark } = state;
  let base = `object${
    circularMark !== undefined ? ` ${stringifyRef(circularMark)}` : ""
  }`;
  state.circularMark = undefined;
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
  const { circularMark } = state;
  let base = `At least one of`;
  if (circularMark !== undefined) {
    base += " " + stringifyRef(circularMark);
    state.circularMark = undefined;
  }
  base += ":";
  // prettier-ignore
  return html`
    ${base}
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
  if (typeName === "Array" || typeName === "Set") {
    // prettier-ignore
    description = html`
    ${typeName} of:
      ${visitIR(elementTypes[0], state)} 
    `;
  } else if (typeName === "Map") {
    // prettier-ignore
    description = html`
      Map:
        key:
          ${visitIR(elementTypes[0], state)}
        value:
          ${visitIR(elementTypes[1]!!, state)}
    `;
  } else {
    throwUnexpectedError(
      `unexpected builtin type: ${typeName} while generating description.`
    );
  }
  return description;
}
