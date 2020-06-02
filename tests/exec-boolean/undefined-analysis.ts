import createValidator, { register } from "../../dist/typecheck.macro";
import { testBooleanValidator as tBV, snapshotFunction } from "./__helpers__";
import test from "ava";
import { format } from "prettier";

test("detect-undefined", (t) => {
  type A = undefined;
  type B = any;
  type C = string | number | (boolean | undefined);
  register("A");
  register("B");
  register("C");
  const x = createValidator<{
    // should use hasOwnProperty
    a: undefined;
    b: any;
    c: unknown;
    d: string | undefined;
    e: string | (number | any);
    1: A;
    2: B;
    3: C;
    // should not use hasOwnProperty
    f?: undefined;
    g?: string | undefined;
    h?: any;
  }>();
  snapshotFunction(t, x);
});
