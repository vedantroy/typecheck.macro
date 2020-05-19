/* distribution of parenthesis type over other types
 *
 * (string | number)[]
 *
 * string[] | number[]
 *
 * parenthesis over "or":
 * (string | number) | Foo
 * === (string | Foo) | (number | Foo)
 * = string | number | Foo
 *
 * Ordering:
 * - an intersection is like an union. Order doesn't matter.
 *  intersections have higher priority than unions.
 *
 * Babel handles parsing... priorities?
 *
 * any series of intersections:
 * - evaluate the types fully for all the sub nodes
 * - intersect them
 *
 * This is acceptable:
 * (Foo | number) & Bar <-- not possible to gen IR
 * Foo & Bar | Foo & number <-- mathematically sound
 *
 * Ok, so that's how we evaluate intersection types.
 *
 * We can evaluate all sub-nodes inside an union, now that
 * we know how to handle intersections
 *
 * (number | Foo) | string
 * --> (string | Foo) | (string | number)
 *
 * (number | (string & number)) | bigint
 *
 * (number | bigint) | (bigint | (string & number))
 * number | bigint | bigint | string & number
 * number & (string | number)
 * a & b | c | d
 * (number | string)[] --> Array<string | number>
 * represented by removing top-level parenthesis
 *
 * createValidator<Foo & Bar>()
 */

import { IR, Intersection, Union, TypeAlias } from "./typeIR";
import deepCopy from "fast-copy";
import { throwMaybeAstError, throwUnexpectedError } from "../macro-assertions";
import { hasAtLeast2Elements } from "../utils/checks";

// logical simplification
// we don't need to do anything for intersections because they have implicit parenthesization
// we can handle intersections at instantation time
// we need to process the parenthesis when they are enforcing artificial priority
//

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

/**
 * A & (B | C) & D
 * traverse over intersection,
 *  when we encounter a union, we add parens and iterate over union children
 *
 *
 *
 */

const isUnion = (x: IR): x is Union => x.type === "union";
const isIntersection = (x: IR): x is Intersection => x.type === "intersection";
const isIntersectionOrUnion = (x: IR): x is Intersection | Union =>
  isIntersection(x) || isUnion(x);

interface State {
  idx: number;
  level: number;
  readonly map: Map<number, IR>;
  mustBeTrue: Set<number>;
}

// TODO: Implement lookup table to improve perf
function simplify(ir: Intersection | Union): Union | Intersection {
  const map = new Map<number, IR>();
  const state = { idx: 0, map, level: -1, mustBeTrue: new Set<number>() };
  const expression = visit(ir, state);
  let minBitsRequired = Infinity;
  let bitConfigs: Array<Array<number>> = [];
  for (let i = 0; i < Math.pow(2, state.idx); ++i) {
    const copy = expression.slice();
    let bitsSet = 0;
    const trueBitIdxs = [];
    for (let j = 0; j < i; ++i) {
      const jthBitIsSet = i & (1 << j);
      if (jthBitIsSet) bitsSet++;
      trueBitIdxs.push(j);
      if (state.mustBeTrue.has(j) && !jthBitIsSet) continue;
      copy.replace(`${j}`, jthBitIsSet ? "true" : "false");
    }
    if (bitsSet > minBitsRequired) continue;
    const res: boolean = eval(copy);
    if (res && bitsSet < minBitsRequired) {
      bitConfigs = [];
    }
    bitConfigs.push(trueBitIdxs);
  }
  if (bitConfigs.length === 0) {
    throwMaybeAstError(
      `for type: ${JSON.stringify(ir)}, could not find valid type`
    );
  }
  const irConfigs: IR[] = [];
  for (const config of bitConfigs) {
    const childTypes: IR[] = [];
    for (const idx of config) {
      const ir = map.get(idx);
      if (ir === undefined) {
        throwUnexpectedError(
          `could not de-serialize idx ${idx} back into type`
        );
      }
      childTypes.push(ir);
    }
    if (childTypes.length === 1) {
      irConfigs.push(childTypes[0]);
    } else if (hasAtLeast2Elements(childTypes)) {
      const intersection: Intersection = {
        type: "intersection",
        childTypes,
      };
      irConfigs.push(intersection);
    } else {
      throwUnexpectedError(
        `valid configuration had less than 1 true types: ${childTypes.length}`
      );
    }
  }
  if (irConfigs.length === 1) {
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

function visit(ir: Intersection | Union, state: State): string {
  state.level += 1;
  const irIsUnion = isUnion(ir);
  const { childTypes } = ir;
  let expr = "(";
  for (let i = 0; i < childTypes.length; ++i) {
    const type = childTypes[i];
    let childExpr = "";
    if (isUnion(type) || isIntersection(type)) {
      childExpr = visit(type, state);
    } else {
      const { map, idx, level, mustBeTrue } = state;
      map.set(idx, type);
      state.idx += 1;
      if (level === 0) {
        mustBeTrue.add(idx);
      }
    }
    expr += i === 0 ? childExpr : `${irIsUnion ? "&&" : "||"} ${childExpr}`;
  }
  return expr + ")";
}

function simplifyUnionsAndIntersections(ir: IR) {
  return traverse<Intersection | Union>(ir, isIntersectionOrUnion, (cur) => {
    return simplify(cur);
  });
}
