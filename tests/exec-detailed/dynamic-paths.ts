import test from "ava";
import {
  createDetailedValidator,
  registerType,
} from "../../dist/typecheck.macro";
import * as u from "../../src/type-ir/IRUtils";
import { InstantiatedType } from "../../src/type-ir/IR";

test("nested-index-sigs", (t) => {
  interface Zorg {
    [key: string]: { [key: string]: number };
  }
  registerType("Zorg");
  const x = createDetailedValidator<Zorg>({ expectedValueFormat: "type-ir" });
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
  t.snapshot(errs);
});

test("nested-arrays", (t) => {
  const x = createDetailedValidator<Array<Array<number>>>({
    expectedValueFormat: "type-ir",
  });
  let errs = [];
  t.true(x([], errs));
  t.true(x([[]], errs));
  t.true(x([[], [2, 3, 4]], errs));
  t.false(x([[], [2, 3, "a", "b"]], errs));
  const numberType = u.PrimitiveType("number");
  const numberArray = u.BuiltinType("Array", numberType, undefined);
  t.deepEqual(errs, [
    ["input[1][2]", "a", numberType],
    ["input[1][3]", "b", numberType],
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
  t.deepEqual(errs, [["input[1]", null, numberArray]]);
});

test("any-array", (t) => {
  const x = createDetailedValidator<Array<any>>({
    expectedValueFormat: "type-ir",
  });
  const errs = [];
  t.true(x([], errs));
  t.false(x(null, errs));
  t.deepEqual(errs, [
    ["input", null, u.BuiltinType("Array", u.PrimitiveType("any"), undefined)],
  ]);
});

test("nested-paths", (t) => {
  const x = createDetailedValidator<Array<{ a: string }>>({
    expectedValueFormat: "type-ir",
  });
  let errs = [];
  t.true(x([{ a: "" }], errs));
  t.deepEqual(errs, []);

  t.false(x([{ a: null }], errs));
  t.deepEqual(errs, [['input[0]["a"]', null, u.PrimitiveType("string")]]);
});
