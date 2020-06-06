import { createDetailedValidator } from "../../dist/typecheck.macro";
import * as u from "../../src/type-ir/IRUtils";
import test from "ava";

test("map-basic", (t) => {
  const x = createDetailedValidator<Map<string, number>>({
    expectedValueAsIR: true,
  });
  let errs = [];
  t.true(x(new Map(), errs));
  t.true(x(new Map([["A", 666]]), errs));

  t.false(x(null, errs));
  t.snapshot(errs);
  errs = [];
  t.false(x(new Map([["hello", "world"]]), errs));
  t.deepEqual(errs, [
    ['input.MAP_GET("hello")', "world", u.PrimitiveType("number")],
  ]);
  errs = [];
  t.false(x(new Map([[32, "world"]]), errs));
  t.deepEqual(errs, [
    ["input.MAP_KEY", 32, u.PrimitiveType("string")],
    ["input.MAP_GET(32)", "world", u.PrimitiveType("number")],
  ]);
  errs = [];
  t.false(x(new Map([[32, 32]]), errs));
  t.deepEqual(errs, [["input.MAP_KEY", 32, u.PrimitiveType("string")]]);
});

test("map-complex", (t) => {
  const x = createDetailedValidator<
    Map<number | Map<number, string>, Map<number, string>>
  >({ expectedValueAsIR: true });
  const numberStringMap = new Map<number, string>([[3, ""]]);
  const stringNumberMap = new Map<string, number>([["", 3]]);
  let errs = [];
  t.true(x(new Map(), errs));
  t.true(x(new Map([[3, numberStringMap]]), errs));
  t.true(x(new Map([[numberStringMap, numberStringMap]]), errs));
  t.deepEqual(errs, []);

  t.false(x(null, errs));
  t.snapshot(errs);
  errs = [];

  t.false(x(new Map([[stringNumberMap, numberStringMap]]), errs));
  t.snapshot(errs);
});
