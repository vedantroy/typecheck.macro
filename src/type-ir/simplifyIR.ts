import { IR, Intersection, Union } from "./typeIR";
import deepCopy from "fast-copy";
import { throwMaybeAstError, throwUnexpectedError } from "../macro-assertions";
import { hasAtLeast2Elements } from "../utils/checks";

/**
 * A helper function that only processes nodes which
 * match a given type predicate function (shouldProcess)
 */
// TODO: Use this in the generic instantiation code
function traverse<T>(
  ir: Readonly<IR>,
  shouldProcess: (obj: unknown) => obj is T,
  process: (obj: T) => IR
): IR {
  function helper(current: IR) {
    for (const [k, v] of Object.entries(current)) {
      if (typeof v !== "object" || v === null) continue;
      if (shouldProcess(v)) {
        // @ts-ignore
        current[k] = process(v);
      } else if (Array.isArray(v)) {
        for (let i = 0; i < v.length; ++i) {
          const element = v[i];
          if (shouldProcess(element)) {
            v[i] = process(element);
          } else helper(element);
        }
      } else helper(v);
    }
  }
  const copy = deepCopy(ir);
  helper(copy);
  return copy;
}

const isUnion = (x: IR): x is Union => x.type === "union";
const isIntersection = (x: IR): x is Intersection => x.type === "intersection";
const isIntersectionOrUnion = (x: IR): x is Intersection | Union =>
  isIntersection(x) || isUnion(x);

// TODO: Implement lookup table to improve perf
// This is only exported for unit testing purposes

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
export function flatten(ir: Intersection | Union): Union | Intersection {
  const map: Record<number, IR> = {};
  const state = { totalNumVars: 0, map };
  // Generate the boolean expression where the types are substituted with variables
  const expression = generateBooleanExpr(ir, state);
  const withoutOuterParens = expression.slice(1, -1);
  const hasParens = /[()]/.test(withoutOuterParens);
  if (!hasParens) {
    // there are no nested unions / intersections
    return ir;
  }
  let minBitsRequired = Infinity;
  let bitConfigs: Array<Array<number>> = [];
  // There are 2 ^ (number of vars) possible boolean configurations. Test all of them.
  outer: for (let i = 0; i < Math.pow(2, state.totalNumVars); ++i) {
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
      copy = copy.replace(`v${j}`, jthBitIsSet ? "true" : "false");
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
    // A & B = A & B
    const intersection = irConfigs[0];
    if (isIntersection(intersection)) {
      return intersection;
    } else {
      throwUnexpectedError(
        `Expected the sole valid configuration to be an intersection, but it was ${JSON.stringify(
          intersection
        )}`
      );
    }
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

interface FlattenState {
  totalNumVars: number;
  // maps variables (v0, v1, ...) in the expression to their corresponding types
  readonly map: Record<number, IR>;
}

/**
 * Converts a Typescript type to a Javascript boolean expression and
 * adds the types to a mapping of variable name in expression --> type
 */
function generateBooleanExpr(
  ir: Intersection | Union,
  state: FlattenState
): string {
  const irIsUnion = isUnion(ir);
  const { childTypes } = ir;
  let expr = "(";
  for (let i = 0; i < childTypes.length; ++i) {
    const type = childTypes[i];
    let childExpr = "";
    if (isUnion(type) || isIntersection(type)) {
      childExpr = generateBooleanExpr(type, state);
    } else {
      const { map, totalNumVars } = state;
      map[totalNumVars] = type;
      childExpr = `v${totalNumVars}`;
      state.totalNumVars += 1;
    }
    expr += i === 0 ? childExpr : `${irIsUnion ? " ||" : " &&"} ${childExpr}`;
  }
  return expr + ")";
}

export function flattenUnionsAndIntersections(ir: IR) {
  return traverse<Intersection | Union>(ir, isIntersectionOrUnion, (cur) => {
    return flatten(cur);
  });
}
