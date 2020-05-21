import { register, __dumpInstantiatedIR } from "../../../dist/typecheck.macro";
import test from "ava";

test("instantiate-simple", (t) => {
  interface Foo<T> {
    val: T;
  }
  register("Foo");
  t.snapshot(__dumpInstantiatedIR<Foo<string>>());
});

test("stats-correct-1", (t) => {
  type D = string;
  type C = D;
  type B = D;
  type A = B | C;
  register("A");
  t.snapshot(__dumpInstantiatedIR<A>());
});

test("circular-1", (t) => {
  type Baz = SC2;
  type Bar = Baz;
  interface SC2 {
    val: Bar | string;
  }
  register("SC2");
  t.snapshot(__dumpInstantiatedIR<SC2>());
});

test("resolve-circular-2", (t) => {
  type Circular<T> = { next: Circular<T> };
  register("Circular");
  t.snapshot(__dumpInstantiatedIR<Circular<string>>());
});