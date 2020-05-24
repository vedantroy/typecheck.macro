import { __dumpInstantiatedIR } from "../../../dist/typecheck.macro";
import test from "ava";

test("intersect-literals", (t) => {
  t.snapshot(__dumpInstantiatedIR<"Hello" & string>());
  t.snapshot(__dumpInstantiatedIR<3 & number>());
  t.snapshot(__dumpInstantiatedIR<true & boolean>());
  t.snapshot(__dumpInstantiatedIR<null & null>());
  t.snapshot(__dumpInstantiatedIR<undefined & undefined>());
});

test("intersect-literals-complex", (t) => {
  t.snapshot(
    __dumpInstantiatedIR<("a" | "b" | "c") & ("a" | "x" | "y" | "b")>()
  );
});

test("tuples-same-length", (t) => {
  t.snapshot(__dumpInstantiatedIR<[string, string] & ["hello", "world"]>());
  t.snapshot(
    __dumpInstantiatedIR<
      [string, string?, string?] & [string, string, string]
    >()
  );
  t.snapshot(
    __dumpInstantiatedIR<
      [string, string?, "Hello"?] & [string, string, string?]
    >()
  );
});

test("tuples-rest", (t) => {
  t.snapshot(
    __dumpInstantiatedIR<[string, string] & ["hello", "world", ...string[]]>()
  );
  t.snapshot(
    __dumpInstantiatedIR<
      [...Array<string | number>] & [3, "hello", string, number]
    >()
  );
  t.snapshot(
    __dumpInstantiatedIR<
      [string, ...string[]] & [string, ...Array<string | number>]
    >()
  );
});

test("tuple-array", (t) => {
  t.snapshot(__dumpInstantiatedIR<[string, string] & Array<string | number>>());
  // TODO: This case MUST be fixed
  // add new field to tuple type indicating whether option props can be undefined
  t.snapshot(
    __dumpInstantiatedIR<[string, string?] & Array<string | number>>()
  );
});

test("map", (t) => {
  t.snapshot(__dumpInstantiatedIR<Map<string, number> & Map<"hello", 42>>());
});

test("set", (t) => {
  t.snapshot(__dumpInstantiatedIR<Set<string> & Set<"hello">>());
});

test("object-pattern-simple", (t) => {
  t.snapshot(__dumpInstantiatedIR<{ hello: string } & { world: number }>());
});
