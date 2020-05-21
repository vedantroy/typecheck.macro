import {
  flatten,
  generateBooleanExpr,
  FlattenState,
} from "../../src/type-ir/passes/flatten";
import * as u from "../../src/type-ir/IRUtils";
import test from "ava";
import deepCopy from "fast-copy";

const numberType = u.PrimitiveType("number");
const nullType = u.PrimitiveType("null");
const fooType = u.Type("foo");

const unFlattenedIntersection = u.Intersection(
  numberType,
  u.Union(fooType, nullType)
);
const unFlattenedUnion = u.Union(numberType, u.Union(fooType, nullType));

const baseState: FlattenState = {
  totalNumVars: 0,
  varToValue: {},
  typeNameToVar: new Map(),
};

test("bool-expr-basic", (t) => {
  t.snapshot(generateBooleanExpr(unFlattenedIntersection, deepCopy(baseState)));
});

test("bool-expr-shared", (t) => {
  const withDuplicateTypesSimple = u.Intersection(numberType, numberType);
  const withDuplicateTypesComplex = u.Union(
    numberType,
    u.Intersection(numberType, fooType),
    fooType
  );
  t.snapshot(
    generateBooleanExpr(withDuplicateTypesSimple, deepCopy(baseState))
  );
  t.snapshot(
    generateBooleanExpr(withDuplicateTypesComplex, deepCopy(baseState))
  );
});

test("flatten-intersection", (t) => {
  t.snapshot(flatten(unFlattenedIntersection));
});

test("flatten-union", (t) => {
  t.snapshot(flatten(unFlattenedUnion));
});
