import { IR, Intersection, Union } from "../IR";
import {
  throwMaybeAstError,
  throwUnexpectedError,
} from "../../macro-assertions";
import { hasAtLeast2Elements } from "../../utils/checks";
import { traverse, getTypeKey } from "./utils";
import {
  isType,
  isPrimitive,
  isIntersectionOrUnion,
  isIntersection,
  isUnion,
  isLiteral,
} from "../IRUtils";

/**
 * We want to simplify:
 * 1. A | (B | C) to A | B | C
 * 2. A & (B | C) to A & B | A & C
 *
 * case #1 is important because by simplifying nested unions,
 * we know whether "undefined" is part of an union. If it is,
 * then we have to use Object.prototype.hasOwnProperty in the codegen,
 * otherwise, we don't.
 *
 * case #2 is important because when we generate code, we don't know
 * how to compute the type of A & (B | C), but we can
 * compute the types of A & B and A & C
 *
 * Type IR doesn't have parenthesis, instead it using nesting to convey
 * priority/what parenthesis would convey.
 * As such, an expression like A & (B | C) is converted into (pseudo type IR):
 *
 * intersection: [
 *  A,
 *  union: [B, C]
 *  ]
 *
 * we need to expand this into
 *
 * union: [
 *   intersection: [A, B],
 *   intersection: [B, C]
 * ]
 *
 * First, we convert the type into a javascript boolean expression.
 * A & (B | C) --> A && (B || C)
 *
 * Then we evaluate it with a truth table (0 = false, 1 = true)
 * | A | B | C | Result |
 * |---|---|---|--------|
 * | 0 | 0 | 0 | 0      |
 * | 0 | 0 | 1 | 0      |
 * | 0 | 1 | 0 | 0      |
 * | 0 | 1 | 1 | 0      |
 * | 1 | 0 | 0 | 0      |
 * | 1 | 0 | 1 | 1      |
 * | 1 | 1 | 0 | 1      |
 * | 1 | 1 | 1 | 1      |
 *
 * The resulting valid configurations are:
 * A & C, A & B, A & B & C
 *
 * We can ignore A & B & C and just focus on the valid configurations
 * with the minimal number of true variables.
 *
 * Thus, A & (B | C) = A & B | A & C, which is what we wanted!
 *
 */

// This is only exported for unit testing purposes
export function flatten(ir: Intersection | Union): IR {
  const map: Record<number, IR> = {};
  const state: FlattenState = {
    totalNumVars: 0,
    varToValue: map,
    typeNameToVar: new Map(),
    duplicatedType: false,
  };
  // Generate the boolean expression where the types are substituted with variables
  const expression = generateBooleanExpr(ir, state);
  const withoutOuterParens = expression.slice(1, -1);
  const hasParens = /[()]/.test(withoutOuterParens);
  if (!hasParens && !state.duplicatedType) {
    // TODO: Test this
    // there are no nested unions / intersections
    return ir;
  }
  let minBitsRequired = Infinity;
  let bitConfigs: Array<Array<number>> = [];
  // There are 2 ^ (number of vars) possible boolean configurations. Test all of them.
  outer: for (let i = 0; i < Math.pow(2, state.totalNumVars); ++i) {
    debugger; //VED:
    let copy = expression.slice();
    let bitsSet = 0;
    const trueVars = [];
    for (let j = 0; j < state.totalNumVars; ++j) {
      const jthBitIsSet = (i & (1 << j)) !== 0;
      if (jthBitIsSet) {
        trueVars.push(j);
        bitsSet++;
      }
      if (bitsSet > minBitsRequired) {
        // ignore non-minimal configurations
        continue outer;
      }
      copy = copy.replace(
        new RegExp(`v${j}`, "g"),
        jthBitIsSet ? "true" : "false"
      );
    }
    const res: boolean = eval(copy);
    if (res) {
      if (bitsSet < minBitsRequired) {
        minBitsRequired = bitsSet;
        bitConfigs = [];
      }
      bitConfigs.push(trueVars);
    }
  }
  if (bitConfigs.length === 0) {
    throwMaybeAstError(
      `for type: ${JSON.stringify(ir)}, could not find valid type configuration`
    );
  }
  // We have found all possible minimal true configurations
  // now map the vars back to their original types and generate
  // the new type IR
  const irConfigs: IR[] = [];
  for (const config of bitConfigs) {
    const childTypes: IR[] = [];
    for (const var_ of config) {
      const ir = map[var_];
      if (ir === undefined) {
        throwUnexpectedError(
          `could not de-serialize idx ${var_} back into type. The map was: ${JSON.stringify(
            map,
            null,
            2
          )}`
        );
      }
      childTypes.push(ir);
    }
    if (childTypes.length === 1) {
      /**
       * If there's only one element in a valid config. For example:
       * type T = A | B | C. The valid configs are {A, B, C}
       * then don't create an intersection type
       */
      irConfigs.push(childTypes[0]);
    } else if (hasAtLeast2Elements(childTypes)) {
      const intersection: Intersection = {
        type: "intersection",
        childTypes,
      };
      irConfigs.push(intersection);
    } else {
      throwUnexpectedError(
        `valid configuration had less than 1 true type: ${childTypes.length}`
      );
    }
  }
  if (irConfigs.length === 1) {
    const soleConfig = irConfigs[0];
    // TODO: We should probably do some checking to ensure
    // the soleConfig is a valid type.

    // 2 cases where a union/intersection reduces to a single configuration:
    // A & B = A & B
    // A | A | A = A
    // The first case shouldn't occur anyway because we have an optimization
    // to ignore simple unions/intersections. So the code wouldn't reach this
    // point.
    return soleConfig;
  } else if (hasAtLeast2Elements(irConfigs)) {
    // A & (B | C) = A & B | A & C
    // create an union out of the valid type configurations
    const union: Union = {
      type: "union",
      childTypes: irConfigs,
    };
    return union;
  } else {
    throwUnexpectedError(
      `irConfigs had length: ${irConfigs.length} even though bitConfigs had length: ${bitConfigs.length}`
    );
  }
}

export interface FlattenState {
  totalNumVars: number;
  // maps variables (v0, v1, ...) in the expression to their corresponding types
  readonly varToValue: Record<number, IR>;
  // maps existing type names ("string", "number", stringified "Foo<T, A, B>")
  // to vars. Used so the generated boolean expr has less vars leading to a
  // shorter truth table.
  // TODO: Make sure this optimization is valid. I'm 75% sure it doesn't break anything...
  readonly typeNameToVar: Map<string, number>;
  duplicatedType: boolean;
}

/**
 * Converts a Typescript type to a Javascript boolean expression and
 * adds the types to a mapping of variable name in expression --> type
 */
// only exported for testing purposes
export function generateBooleanExpr(
  ir: Intersection | Union,
  state: FlattenState
): string {
  const irIsUnion = isUnion(ir);
  const { childTypes } = ir;
  let expr = "(";
  for (let i = 0; i < childTypes.length; ++i) {
    const type = childTypes[i];
    let childExpr = "";
    if (isIntersectionOrUnion(type)) {
      childExpr = generateBooleanExpr(type, state);
    } else {
      const { varToValue, typeNameToVar } = state;
      const typeName = isPrimitive(type)
        ? type.typeName
        : isType(type) || isLiteral(type)
        ? getTypeKey(type)
        : null;
      let var_: number | null = null;
      if (typeName !== null) {
        const existingVar = typeNameToVar.get(typeName);
        if (existingVar !== undefined) {
          state.duplicatedType = true;
          var_ = existingVar;
        } else typeNameToVar.set(typeName, state.totalNumVars);
      }
      var_ = var_ !== null ? var_ : state.totalNumVars++;
      varToValue[var_] = type;
      childExpr = `v${var_}`;
    }
    expr += i === 0 ? childExpr : `${irIsUnion ? " ||" : " &&"} ${childExpr}`;
  }
  return expr + ")";
}

function flattenUnionsAndIntersections(ir: IR): IR {
  return traverse<Intersection | Union>(ir, isIntersectionOrUnion, (cur) => {
    return flatten(cur);
  });
}

export default flattenUnionsAndIntersections;
