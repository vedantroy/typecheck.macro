import { oneLine } from "common-tags";
import {
  isIntersection,
  isInstantiatedType,
  isBuiltinType,
  isTuple,
  isPrimitive,
  isLiteral,
} from "../IRUtils";
import { MacroError } from "babel-plugin-macros";
import { TypeInfo } from "./instantiate";
import {
  IR,
  BuiltinTypeName,
  LiteralValue,
  BuiltinType,
  Tuple,
  ObjectPattern,
  PropertySignature,
} from "../IR";
import { traverse, getTypeInfo } from "./utils";
import {
  throwUnexpectedError,
  throwMaybeAstError,
} from "../../macro-assertions";
import { flatten } from "./flatten";
import * as u from "../IRUtils";

export default function solveIntersections(
  ir: IR,
  instantiatedTypes: Map<string, TypeInfo>
): IR {
  return traverse(ir, isIntersection, (intersection) => {
    const { childTypes } = intersection;
    let left = childTypes[0];
    for (let i = 1; i < childTypes.length; ++i) {
      const right = childTypes[i];
      left = intersect(left, right, instantiatedTypes);
    }
    return left;
  });
}

function retrieveInstantiation(
  ir: IR,
  instantiatedTypes: Map<string, TypeInfo>
): IR {
  if (isInstantiatedType(ir)) {
    const instantiated = instantiatedTypes.get(ir.typeName);
    if (instantiated === undefined)
      throwUnexpectedError(`Could not find instantiated type: ${ir.typeName}`);
    return instantiated.value;
  }
  return ir;
}

function intersect(
  left: IR,
  right: IR,
  instantiatedTypes: Map<string, TypeInfo>
): IR {
  left = retrieveInstantiation(left, instantiatedTypes);
  right = retrieveInstantiation(right, instantiatedTypes);

  const leftInfo = getTypeInfo(left);
  const rightInfo = getTypeInfo(right);
  // imprecise because any & unknown = unknown. But it's the same
  // at the code gen level
  if (leftInfo.isAnything) return right;
  if (rightInfo.isAnything) return left;

  const leftDisjoint = leftInfo.disjointType;
  const rightDisjoint = rightInfo.disjointType;
  if (leftDisjoint === undefined || rightDisjoint === undefined) {
    throwUnexpectedError(oneLine`Hierarchy info did not have isAnything and did not have disjointType. 
        Possible infos: ${JSON.stringify(leftInfo)}, ${JSON.stringify(
      rightInfo
    )}`);
  }

  if (leftDisjoint !== rightDisjoint) {
    return u.FailedIntersection();
  }

  switch (leftDisjoint) {
    case "Array":
      if (isTuple(left)) {
        if (isTuple(right))
          return intersectTuples(left, right, instantiatedTypes);
        else {
          u.assertBuiltinType(right, "Array");
          return intersectArrayAndTuple(right, left, instantiatedTypes);
        }
      } else if (isTuple(right)) {
        u.assertBuiltinType(left, "Array");
        return intersectArrayAndTuple(left, right, instantiatedTypes);
      } else {
        u.assertBuiltinType(left, "Array");
        u.assertBuiltinType(right, "Array");
        return intersectArrays(left, right, instantiatedTypes);
      }
    case "boolean":
    case "number":
    case "string":
      if (isPrimitive(left)) {
        if (isPrimitive(right)) return left;
        else {
          u.assertLiteral(right);
          return right;
        }
      } else if (u.isPrimitive(right)) {
        u.assertLiteral(left);
        return left;
      } else {
        u.assertLiteral(left);
        u.assertLiteral(right);
        if (left.value == right.value) {
          return left;
        }
        return u.FailedIntersection();
      }
    case "null":
    case "undefined":
      u.assertPrimitiveType(right);
      return left;
    case "object":
      if (u.isPrimitive(left)) {
        return right;
      } else if (u.isPrimitive(right)) {
        return left;
      } else {
        u.assertObjectPattern(left);
        u.assertObjectPattern(right);
        return intersectObjectPatterns(left, right, instantiatedTypes);
      }
    case "Map":
      u.assertBuiltinType(left, "Map");
      u.assertBuiltinType(right, "Map");
      return intersectMaps(left, right, instantiatedTypes);
    case "Set":
      u.assertBuiltinType(left, "Set");
      u.assertBuiltinType(right, "Set");
      return intersectSets(left, right, instantiatedTypes);
    default:
      throwUnexpectedError(`Had unexpected disjoint type: ${leftDisjoint}`);
  }
}

function propertySignatureArrayToMap(
  sigs: PropertySignature[]
): Map<string | number, { opt: boolean; value: IR }> {
  return new Map(
    sigs.map((sig) => [sig.keyName, { opt: sig.optional, value: sig.value }])
  );
}

function intersectObjectPatterns(
  t1: ObjectPattern,
  t2: ObjectPattern,
  instantiatedTypes: Map<string, TypeInfo>
): ObjectPattern {
  const sI1 = t1.stringIndexerType,
    sI2 = t2.stringIndexerType;
  const nI1 = t1.numberIndexerType,
    nI2 = t2.numberIndexerType;
  const resolvedStringIndexSignature =
    sI1 && sI2 ? intersectTypes(sI1, sI2, instantiatedTypes) : sI1 || sI2;
  let resolvedNumberIndexSignature =
    nI1 && nI2 ? intersectTypes(nI1, nI2, instantiatedTypes) : nI1 || nI2;
  if (resolvedStringIndexSignature && resolvedNumberIndexSignature) {
    resolvedNumberIndexSignature = intersectTypes(
      resolvedNumberIndexSignature,
      resolvedStringIndexSignature,
      instantiatedTypes
    );
  }

  const t1Props = propertySignatureArrayToMap(t1.properties);
  const t2Props = propertySignatureArrayToMap(t2.properties);

  const intersectedProperties: PropertySignature[] = [];
  for (const [key, { opt, value }] of t1Props.entries()) {
    if (t2Props.has(key)) {
      const { opt: opt2, value: value2 } = t2Props.get(key)!!;
      intersectedProperties.push(
        u.PropertySignature(
          key,
          opt && opt2,
          intersectTypes(value, value2, instantiatedTypes)
        )
      );
      t2Props.delete(key);
    } else {
      intersectedProperties.push(u.PropertySignature(key, opt, value));
    }
  }

  for (const [key, { opt, value }] of t2Props.entries()) {
    intersectedProperties.push(u.PropertySignature(key, opt, value));
  }

  return {
    type: "objectPattern",
    properties: intersectedProperties,
    stringIndexerType: resolvedStringIndexSignature,
    numberIndexerType: resolvedNumberIndexSignature,
  };
}

function intersectSets(
  t1: BuiltinType<"Set">,
  t2: BuiltinType<"Set">,
  instantiatedTypes: Map<string, TypeInfo>
): BuiltinType<"Set"> {
  const intersection = intersectTypes(
    t1.elementTypes[0],
    t2.elementTypes[0],
    instantiatedTypes
  );
  if (u.isFailedIntersection(intersection)) {
    throwMaybeAstError(
      `failed to intersect ${JSON.stringify(t1)}, ${JSON.stringify(
        t2
      )} when intersecting Sets`
    );
  }
  return u.BuiltinType("Set", intersection, undefined);
}

function intersectMaps(
  t1: BuiltinType<"Map">,
  t2: BuiltinType<"Map">,
  instantiatedTypes: Map<string, TypeInfo>
): BuiltinType<"Map"> {
  const key1 = t1.elementTypes[0],
    key2 = t2.elementTypes[0];
  const value1 = t1.elementTypes[1],
    value2 = t2.elementTypes[1];
  const keyIntersection = intersectTypes(key1, key2, instantiatedTypes);
  const valueIntersection = intersectTypes(value1, value2, instantiatedTypes);
  if (u.isFailedIntersection(keyIntersection)) {
    throwMaybeAstError(
      `failed to intersect ${JSON.stringify(key1)}, ${JSON.stringify(
        key2
      )} when intersecting map keys`
    );
  }
  if (u.isFailedIntersection(valueIntersection)) {
    throwMaybeAstError(
      `failed to intersect ${JSON.stringify(value1)}, ${JSON.stringify(
        value2
      )} when intersecting map values`
    );
  }
  return u.BuiltinType("Map", keyIntersection, valueIntersection);
}

function intersectTypes(
  t1: IR,
  t2: IR,
  instantiatedTypes: Map<string, TypeInfo>
): IR {
  return solveIntersections(flatten(u.Intersection(t1, t2)), instantiatedTypes);
}

function intersectArrays(
  arr1: BuiltinType<"Array">,
  arr2: BuiltinType<"Array">,
  instantiatedTypes: Map<string, TypeInfo>
): BuiltinType<"Array"> {
  const intersectionOfArrayTypes = intersectTypes(
    arr1.elementTypes[0],
    arr2.elementTypes[0],
    instantiatedTypes
  );
  return u.BuiltinType("Array", intersectionOfArrayTypes, undefined);
}

function intersectArrayAndTuple(
  arr: BuiltinType<"Array">,
  tuple: Tuple,
  instantiatedTypes: Map<string, TypeInfo>
): Tuple {
  const arrayType = arr.elementTypes[0];
  const resolvedTypes: IR[] = [];
  for (const type of tuple.childTypes) {
    resolvedTypes.push(intersectTypes(type, arrayType, instantiatedTypes));
  }
  let resolvedRestType: IR | undefined;
  if (tuple.restType) {
    resolvedRestType = intersectTypes(
      tuple.restType,
      arrayType,
      instantiatedTypes
    );
  }
  return u.Tuple({
    childTypes: resolvedTypes,
    restType: resolvedRestType,
    firstOptionalIndex: tuple.firstOptionalIndex,
  });
}

function safeIntersectTupleTypes(
  t1: IR,
  t2: IR,
  instantiatedTypes: Map<string, TypeInfo>
): IR {
  const intersected = intersectTypes(t1, t2, instantiatedTypes);
  if (u.isFailedIntersection(intersected)) {
    throwMaybeAstError(
      `Failed to intersect types: ${JSON.stringify(t1)}, ${JSON.stringify(
        t2
      )} when intersecting tuples`
    );
  }
  return intersected;
}

function intersectTuples(
  tuple1: Tuple,
  tuple2: Tuple,
  instantiatedTypes: Map<string, TypeInfo>
) {
  const children1 = tuple1.childTypes;
  const children2 = tuple2.childTypes;
  const [l1, l2] = [children1.length, children2.length];
  const [shorterTuple, longerTuple] =
    l2 > l1 ? [tuple1, tuple2] : [tuple2, tuple1];

  if (
    l1 !== l2 &&
    shorterTuple.restType === undefined &&
    longerTuple.firstOptionalIndex > shorterTuple.childTypes.length
  ) {
    // TODO: Make this a testable error
    // AST error doesn't fit here
    throwMaybeAstError(oneLine`cannot intersect tuples of different lengths unless
      the shorter tuple has a rest type or the longer tuple's  optional elements are right after the shorter tuple's
      elements`);
  }
  const resolvedTypes: IR[] = [];
  const shorterLen = Math.min(l1, l2);
  const longerLen = Math.max(l1, l2);
  for (let i = 0; i < shorterLen; ++i) {
    resolvedTypes.push(
      safeIntersectTupleTypes(
        shorterTuple.childTypes[i],
        longerTuple.childTypes[i],
        instantiatedTypes
      )
    );
  }
  if (shorterTuple.restType) {
    for (let i = shorterLen; i < longerLen; ++i) {
      resolvedTypes.push(
        safeIntersectTupleTypes(
          shorterTuple.restType,
          longerTuple.childTypes[i],
          instantiatedTypes
        )
      );
    }
  }
  const [shortRest, longRest] = [shorterTuple.restType, longerTuple.restType];
  const resolvedRestType =
    shortRest && longRest
      ? intersectTypes(shortRest, longRest, instantiatedTypes)
      : undefined;
  return u.Tuple({
    childTypes: resolvedTypes,
    firstOptionalIndex: Math.max(
      tuple1.firstOptionalIndex,
      tuple2.firstOptionalIndex
    ),
    restType: resolvedRestType,
  });
}
