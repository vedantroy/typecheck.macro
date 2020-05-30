import test from "ava";
import { createDetailedValidator, register } from "../../dist/typecheck.macro";
import * as u from "../../src/type-ir/IRUtils";

test("nested-index-sigs", (t) => {
  interface Zorg {
    [key: string]: { [key: string]: number };
  }
  register("Zorg");
  const x = createDetailedValidator<Zorg>();
  const errs = [];
  t.false(x({ a: { b: "eggplant" } }, errs));
  t.deepEqual(errs, [
    [
      `input["a"]["b"]`,
      "eggplant",
      { type: "primitiveType", typeName: "number" },
    ],
  ]);
});

test("nested-arrays", (t) => {
  const x = createDetailedValidator<Array<Array<number>>>();
  const errs = [];
  t.true(x([], errs));
  t.true(x([[]], errs));
  t.true(x([[], [2, 3, 4]], errs));
  t.false(x([[], [2, 3, "a"]], errs));
  t.deepEqual(errs, [
    [
      "input[1][2]",
      "a",
      u.BuiltinType("Array", u.PrimitiveType("number"), undefined),
    ],
  ]);
});
