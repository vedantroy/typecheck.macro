import createValidator from "../../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import type { ExecutionContext } from "ava";

export default (t: ExecutionContext) => {
  const emptyTupleV = createValidator<[]>();
  tBV(t, emptyTupleV, { inputs: [[], new Array(0)], returns: true });

  const basicTupleV = createValidator<[number, number, number]>();
  tBV(t, basicTupleV, {
    inputs: [
      [0, 1, 2],
      [NaN, Infinity, 42],
    ],
    returns: true,
  });

  tBV(t, basicTupleV, {
    inputs: [new Array(3), [0, 1, 2, 4], [undefined, 2, 3]],
    returns: false,
  });

  const anyTupleV = createValidator<[any, any, number]>();
  const partiallyEmptyArray = new Array(3);
  partiallyEmptyArray[2] = 3;
  tBV(t, anyTupleV, {
    inputs: [["hello", {}, 3], partiallyEmptyArray],
    returns: true,
  });
  tBV(t, anyTupleV, {
    input: [3],
    returns: false,
  });

  const optionalTupleV = createValidator<[number, string?, boolean?]>();
  tBV(t, optionalTupleV, {
    inputs: [
      [3],
      [3, undefined],
      [3, "s"],
      [3, "s", undefined],
      [3, "s", true],
      [3, undefined, false],
      [3, undefined, undefined],
    ],
    returns: true,
  });

  tBV(t, optionalTupleV, { input: [[3, true]], r: false });
  const restTupleV = createValidator<[number?, ...number[]]>();

  tBV(t, restTupleV, {
    inputs: [[], [1], [1, 2, 3, 4], [undefined, 1, 2], [undefined]],
    returns: true,
  });

  tBV(t, restTupleV, {
    input: [undefined, undefined],
    returns: false,
  });
};
