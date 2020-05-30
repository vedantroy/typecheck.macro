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
  u.Union(undefined, fooType, nullType)
);
const unFlattenedUnion = u.Union(
  undefined,
  numberType,
  u.Union(undefined, fooType, nullType)
);

const baseState: FlattenState = {
  totalNumVars: 0,
  varToValue: {},
  typeNameToVar: new Map(),
  duplicatedType: false,
};

test("bool-expr-basic", (t) => {
  t.snapshot(generateBooleanExpr(unFlattenedIntersection, deepCopy(baseState)));
});

test("bool-expr-shared", (t) => {
  const withDuplicateTypesSimple = u.Intersection(numberType, numberType);
  const withDuplicateTypesComplex = u.Union(
    undefined,
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

const duplicateLiteralIntersection = u.Intersection(
  u.Union(undefined, u.Literal("a"), u.Literal("b"), u.Literal("c")),
  u.Union(
    undefined,
    u.Literal("a"),
    u.Literal("b"),
    u.Literal("x"),
    u.Literal("y"),
    u.Literal("z")
  )
);

test("bool-expr-shared-literals", (t) => {
  t.snapshot(
    generateBooleanExpr(duplicateLiteralIntersection, deepCopy(baseState))
  );
});

test("flatten-shared-literals", (t) => {
  t.snapshot(flatten(duplicateLiteralIntersection));
});

test("flatten-intersection", (t) => {
  t.snapshot(flatten(unFlattenedIntersection));
});

test("flatten-union", (t) => {
  t.snapshot(flatten(unFlattenedUnion));
});
