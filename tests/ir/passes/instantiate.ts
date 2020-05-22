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

test("merge-arrays", (t) => {
  type Arr<T> = T[] | Array<T> | ReadonlyArray<T>;
  register("Arr");
  t.snapshot(__dumpInstantiatedIR<Arr<string>>());
});

test("merge-sets", (t) => {
  type MS<T> = Set<T> | ReadonlySet<T>;
  register("MS");
  t.snapshot(__dumpInstantiatedIR<MS<string>>());
});

test("merge-maps", (t) => {
  type FM<T, K = number> = Map<T, K> | ReadonlyMap<K, T> | ReadonlyMap<K, T>;
  register("FM");
  t.snapshot(__dumpInstantiatedIR<FM<string>>());
});
test("complex-type-parameter", (t) => {
  type Circular2<T> = { next: Circular2<T> };
  type STR = string;
  register("Circular2");
  register("STR");
  t.snapshot(
    __dumpInstantiatedIR<
      Circular2<string> | Circular2<string> | Circular2<number> | STR
    >()
  );
});
