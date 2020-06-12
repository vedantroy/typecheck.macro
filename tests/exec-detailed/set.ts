import { createDetailedValidator } from "../../dist/typecheck.macro";
import * as u from "../../src/type-ir/IRUtils";
import test from "ava";

test("set-basic", (t) => {
  const x = createDetailedValidator<Set<number>>({
    expectedValueFormat: "type-ir",
  });
  let errs = [];
  t.true(x(new Set([1]), errs));
  t.true(x(new Set([]), errs));
  t.true(x(new Set(), errs));
  t.deepEqual(errs, []);

  t.false(x(null, errs));
  t.snapshot(errs);
  errs = [];

  t.false(x(new Set(["a"]), errs));
  t.deepEqual(errs, [["input.SET_ELEMENT", "a", u.PrimitiveType("number")]]);
});
