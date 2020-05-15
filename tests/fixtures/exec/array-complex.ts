import createValidator from "../../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import type { ExecutionContext } from "ava";

export default (t: ExecutionContext) => {
  const validator = createValidator<Array<number | Array<number>>>();
  console.log(validator.toString())
  tBV(t, validator, {
    inputs: [[], [1], [1, [1, 2]]],
    returns: true,
  });
  tBV(t, validator, {
    inputs: [
      [1, null],
      [1, [1, [2]]],
    ],
    returns: false,
  });
};
