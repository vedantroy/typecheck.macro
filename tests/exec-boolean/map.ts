import createValidator from "../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import test from "ava";

test("map-basic", (t) => {
  const validator = createValidator<Map<string, number>>();
  tBV(t, validator, {
    inputs: [new Map(), new Map([["X Æ A-12 hello", 666]])],
    returns: true,
  });
  tBV(t, validator, {
    inputs: [
      undefined,
      null,
      new Map([["hello", "world"]]),
      new Map([[32, 45]]),
      new Map([[true, false]]),
    ],
    returns: false,
  });
});

test("map-complex", (t) => {
  const validator = createValidator<
    Map<number | Map<number, string>, Map<number, string>>
  >();
  const numberStringMap = new Map<number, string>([[3, ""]]);
  const stringNumberMap = new Map<string, number>([["", 3]]);
  tBV(t, validator, {
    inputs: [
      new Map(),
      new Map([[3, numberStringMap]]),
      new Map([[numberStringMap, numberStringMap]]),
    ],
    returns: true,
  });
  tBV(t, validator, {
    inputs: [
      undefined,
      null,
      new Map([["", numberStringMap]]),
      new Map([[stringNumberMap, numberStringMap]]),
      new Map([[3, stringNumberMap]]),
    ],
    returns: false,
  });
});
