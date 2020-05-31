import createValidator from "../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import test from "ava";

test("string-literal", (t) => {
  const helloV = createValidator<"he\"l''l\no">();
  const weirdString = "he\"l''l\no";
  tBV(t, helloV, {
    input: weirdString,
    returns: true,
  });
  tBV(t, helloV, {
    inputs: [JSON.stringify(weirdString), "not-equal"],
    returns: false,
  });
});

test("literal-boolean", (t) => {
  const falseV = createValidator<false>();
  tBV(t, falseV, {
    input: false,
    returns: true,
  });
  tBV(t, falseV, {
    // other falsey values that aren't false
    input: [0, "", null, undefined, NaN],
    returns: false,
  });
});

test("literal-number", (t) => {
  const sixsixsixV = createValidator<666>();
  tBV(t, sixsixsixV, {
    // normal, float, octal, hex
    inputs: [666, 666.0, 0o1232, 0x29a],
    returns: true,
  });
  tBV(t, sixsixsixV, {
    inputs: [665, NaN],
    returns: false,
  });
});
