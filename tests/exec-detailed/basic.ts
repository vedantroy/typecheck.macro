import { createDetailedValidator, registerType } from "../../dist/typecheck.macro";
import test from "ava";
import * as u from "../../src/type-ir/IRUtils";

test("literal", (t) => {
  const x = createDetailedValidator<"Hello">({ expectedValueAsIR: true });
  let errs = [];
  t.true(x("Hello", errs));
  t.deepEqual(errs, []);

  t.false(x(null, errs));
  const helloLiteral = u.Literal("Hello");
  t.deepEqual(errs, [["input", null, helloLiteral]]);
  errs = [];
  t.false(x("hello2", errs));
  t.deepEqual(errs, [["input", "hello2", helloLiteral]]);
});
