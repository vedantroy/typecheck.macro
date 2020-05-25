import { __dumpInstantiatedIR } from "../../../dist/typecheck.macro";
import test from "ava";

test("has-undefined-simple", (t) => {
  t.snapshot(__dumpInstantiatedIR<null | "undefined" | 0 | false>());
  t.snapshot(__dumpInstantiatedIR<undefined | true>());
});

test("has-undefined-complex", (t) => {
  t.snapshot(
    __dumpInstantiatedIR<
      true | false | number | ("hello" | (undefined & any))
    >()
  );
  t.snapshot(
    __dumpInstantiatedIR<true | false | number | ("hello" | undefined)>()
  );
});
