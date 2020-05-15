import createValidator from "../../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import type { ExecutionContext } from "ava";

export default (t: ExecutionContext) => {
  const helloV = createValidator<"he\"l''l\no">();
  const weirdString = "he\"l''l\no";
  const sixsixsixV = createValidator<666>();
  const falseV = createValidator<false>();
  tBV(t, helloV, {
    input: weirdString,
    returns: true,
  });
  tBV(t, helloV, {
    inputs: [JSON.stringify(weirdString), "not-equal"],
    returns: weirdString === JSON.stringify(weirdString),
  });
  tBV(t, sixsixsixV, {
    // normal, float, octal, hex
    inputs: [666, 666.0, 0o1232, 0x29a],
    returns: true,
  });
  tBV(t, sixsixsixV, {
    inputs: [665, NaN],
    returns: false,
  });
  tBV(t, falseV, {
    input: false,
    returns: true,
  });
  tBV(t, falseV, {
    // other falsey values that aren't false
    input: [0, "", null, undefined, NaN],
    returns: false,
  });
};
