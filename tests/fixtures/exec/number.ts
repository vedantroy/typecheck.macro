import createValidator from "../../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import type { ExecutionContext } from "ava";

export default (t: ExecutionContext) => {
  const numberV = createValidator<number>();
  tBV(t, numberV, {
    // seems odd, but NaN and Infinity
    // are both of type number in Typescript
    // (and the typeof operator)
    // This is why this file exists!
    input: [-1, 0, 1, NaN, Infinity],
    returns: true,
  });
  tBV(t, numberV, {
    // seems odd, but NaN and Infinity
    // are both of type number in Typescript
    // (and the typeof operator)
    input: ["hello", null, {}],
    returns: false,
  });
};
