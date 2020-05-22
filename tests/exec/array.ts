import createValidator from "../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import test from "ava";

test("array-basic", (t) => {
  const validator = createValidator<number[]>();
  tBV(t, validator, {
    inputs: [[], [1]],
    returns: true,
  });
  tBV(t, validator, {
    inputs: [undefined, null, "hello", 1, {}, new Set(), new Map()],
    returns: false,
  });
});

test("array-complex", (t) => {
  const validator = createValidator<Array<number | Array<number>>>();
  tBV(t, validator, {
    inputs: [[], [1], [1, [1, 2]]],
    returns: true,
  });
  tBV(t, validator, {
    inputs: [undefined, null, new Set(), [1, null], [1, [1, [2]]]],
    returns: false,
  });
});
