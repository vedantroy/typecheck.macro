import test from "ava";
import { createDetailedValidator, register } from "../../dist/typecheck.macro";
import * as u from "../../src/type-ir/IRUtils";
import { format } from "prettier";
import { InstantiatedType } from "../../src/type-ir/IR";

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
  t.false(x(null, errs));
  t.snapshot(errs)
});

test("nested-arrays", (t) => {
  const x = createDetailedValidator<Array<Array<number>>>();
  let errs = [];
  t.true(x([], errs));
  t.true(x([[]], errs));
  t.true(x([[], [2, 3, 4]], errs));
  t.false(x([[], [2, 3, "a", "b"]], errs));
  const numberArray = u.BuiltinType(
    "Array",
    u.PrimitiveType("number"),
    undefined
  );
  t.deepEqual(errs, [
    ["input[1][2]", "a", numberArray],
    ["input[1][3]", "b", numberArray],
  ]);

  errs = [];
  t.false(x(null, errs));
  t.deepEqual(errs, [
    [
      "input",
      null,
      u.BuiltinType(
        "Array",
        {
          type: "instantiatedType",
          typeName: 'Array[{"type":"primitiveType","typeName":"number"}]',
        } as InstantiatedType,
        undefined
      ),
    ],
  ]);
  errs = [];
  t.false(x([[1], null], errs));
  t.deepEqual(errs, [["input[1][1]", null, numberArray]]);
});
