import createValidator, { register } from "../../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import type { ExecutionContext } from "ava";

export default (t: ExecutionContext) => {
  type T1<A> = {
    val: Array<A>;
  };
  type T2<A> = {
    val: T1<A>;
  };
  type Foo<A> = {
    val: Array<A>;
  };
  register("T2");
  register("Foo");
  const validator = createValidator<T2<Foo<string>>>();
  tBV(t, validator, {
    inputs: [
      { val: { val: [] } },
      { val: { val: [{ val: [] }] } },
      { val: { val: [{ val: ["hello"] }] } },
    ],
    returns: true,
  });
  tBV(t, validator, {
    inputs: [
      undefined,
      null,
      "hello",
      1,
      {},
      new Set(),
      new Map(),
      { val: { val: [{ val: {} }] } },
    ],
    returns: false,
  });
};
