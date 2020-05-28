import {
  IR,
  PrimitiveType,
  Union,
  ObjectPattern,
  InstantiatedType,
  Tuple,
  Literal,
} from "../type-ir/IR";
import { throwMaybeAstError, throwUnexpectedError } from "../macro-assertions";

export function visitIR(ir: IR): string {
  let visitorFunction: (ir: IR) => string;
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
    case "failedIntersection":
      throwMaybeAstError(
        `found failedIntersection while generating code. This generally means you have an invalid intersection in your types.`
      );
    default:
      throwUnexpectedError(`unexpected ir type: ${ir.type}`);
  }
  return visitorFunction(ir);
}

function visitPrimitiveType(ir: PrimitiveType): string {}

function visitLiteral(ir: Literal): string {}

function visitInstantiatedType(ir: InstantiatedType): string {}

function visitObjectPattern(ir: ObjectPattern): string {}

function visitUnion(ir: Union): string {}

function visitTuple(ir: Tuple): string {}
