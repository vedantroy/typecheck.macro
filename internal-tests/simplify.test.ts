import { flatten } from "../src/type-ir/simplifyIR";
import test from "ava";
import type {
  Union,
  PrimitiveType,
  Type,
  Intersection,
} from "../src/type-ir/typeIR";

const numberType: PrimitiveType = {
  type: "primitiveType",
  typeName: "number",
};
const nullType: PrimitiveType = { type: "primitiveType", typeName: "null" };
const fooType: Type = { type: "type", typeName: "foo" };

test("flatten-union", (t) => {
  const notFlattened: Union = {
    type: "union",
    childTypes: [
      numberType,
      { type: "union", childTypes: [nullType, fooType] } as Union,
    ],
  };
  const flattened: Union = {
    type: "union",
    childTypes: [numberType, nullType, fooType],
  };
  t.deepEqual(flatten(notFlattened), flattened);
});

test("flatten-intersection", (t) => {
  const notFlattened: Intersection = {
    type: "intersection",
    childTypes: [
      numberType,
      { type: "union", childTypes: [nullType, fooType] } as Union,
    ],
  };
  const flattened: Union = {
    type: "union",
    childTypes: [
      {
        type: "intersection",
        childTypes: [numberType, nullType],
      } as Intersection,
      {
        type: "intersection",
        childTypes: [numberType, fooType],
      } as Intersection,
    ],
  };
  t.deepEqual(flatten(notFlattened), flattened);
});
