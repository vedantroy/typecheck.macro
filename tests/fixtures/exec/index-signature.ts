import createValidator from "../../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import type { ExecutionContext } from "ava";

export default (t: ExecutionContext) => {
  const indexV = createValidator<{
    [key: string]: string | number;
    [key: number]: string;
  }>();
  tBV(t, indexV, {
    input: [
      {},
      { a: "s", b: 3, 3: "s" },
      { a: "s", b: 3, Infinity: "s", NaN: "s" },
    ],
    returns: true,
  });
  tBV(t, indexV, {
    input: [{ 3: 3 }, { a: true }, { Infinity: 3 }, { NaN: 3 }, undefined],
    returns: false,
  });
};
