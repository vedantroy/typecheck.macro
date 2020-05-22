import createValidator from "../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import test from "ava";

test("numbers", (t) => {
  const numberV = createValidator<number>();
  tBV(t, numberV, {
    // NaN and Infinity are both numbers
    // (according to the typeof operator,
    // which Typescript uses for categorizing things)
    // This is why this file exists!
    input: [-1, 0, 1, NaN, Infinity],
    returns: true,
  });
  tBV(t, numberV, {
    input: ["hello", null, {}],
    returns: false,
  });
});
