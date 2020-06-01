import createValidator, { register } from "../../dist/typecheck.macro";
import { testBooleanValidator as tBV, snapshotFunction } from "./__helpers__";
import test from "ava";

test("basic", (t) => {
  function test(validator: Function) {
    tBV(t, validator, {
      input: { val1: {}, val2: {} },
      returns: true,
    });
    tBV(t, validator, {
      inputs: [null, undefined, {}, { val1: {}, val2: null }],
      returns: false,
    });
  }

  interface Bar {}
  interface Foo {
    val1: Bar;
    val2: Bar;
  }
  register("Foo");
  const simple = createValidator<Foo>();
  // snapshotting generated code is discouraged because
  // it's brittle since non-important changes will require
  // snapshot updates, but...
  // we do it here b/c we need to verify functions are being
  // hoisted correctly
  snapshotFunction(t, simple);
  test(simple);

  type A<T> = T;
  interface GenFoo<T> {
    val1: T;
    val2: A<T>;
  }
  register("GenFoo");
  const complex = createValidator<GenFoo<Bar>>();
  snapshotFunction(t, complex);
  test(complex);

  const duplicateInstantiatedGeneric = createValidator<GenFoo<Array<string>>>();
  snapshotFunction(t, duplicateInstantiatedGeneric);
  tBV(t, duplicateInstantiatedGeneric, {
    input: { val1: [], val2: ["a", "b"] },
    returns: true,
  });

  tBV(t, duplicateInstantiatedGeneric, {
    inputs: [
      null,
      undefined,
      { val1: null, val2: ["a", "b"] },
      { val1: ["a"], val2: [3] },
    ],
    returns: false,
  });
});
