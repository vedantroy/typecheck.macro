import createValidator, {
  __dumpAllIR,
  register,
} from "../../dist/typecheck.macro";
import { testName } from "./_helpers";
import test from "ava";
import { stringify } from "javascript-stringify";

test(testName(__filename), (t) => {
  interface Foo {}
  type A = {
    val1: Foo;
    val2: Foo;
  };
  register("A");
  createValidator<A>();
  console.log(stringify(__dumpAllIR, null, 2));
  t.snapshot(__dumpAllIR);
});
