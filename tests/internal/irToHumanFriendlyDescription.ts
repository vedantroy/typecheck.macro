import { humanFriendlyDescription } from "../../src/code-gen/irToHumanFriendlyDescription";
import { registerType, __dumpInstantiatedIR } from "../../dist/typecheck.macro";
import * as u from "../../src/type-ir/IRUtils";
import test from "ava";

const simpleState = { typeName: undefined, instantiatedTypes: new Map() };

test("simple", (t) => {
  t.snapshot(humanFriendlyDescription(u.PrimitiveType("string"), simpleState));
  t.snapshot(humanFriendlyDescription(u.Literal("hello"), simpleState));
  t.snapshot(humanFriendlyDescription(u.Literal(3), simpleState));
});

test("complex", (t) => {
  type Complex =
    | null
    | number
    | {
        a?: [
          number | "foo" | false | { a: [number, Array<number | string>] },
          number?,
          ...string[]
        ];
        b: "bar" | false;
        [key: number]: string;
      };
  registerType("Complex");
  const map = __dumpInstantiatedIR<Complex>();
  t.snapshot(
    humanFriendlyDescription(map.get("Complex")!!.value, {
      typeName: "Complex",
      instantiatedTypes: map,
    })
  );
});

test("object-pattern", (t) => {
  type Pat = { [key: string]: string | number; [key: number]: number };
  registerType("Pat");
  const map = __dumpInstantiatedIR<Pat>();
  t.snapshot(
    humanFriendlyDescription(map.get("Pat")!!.value, {
      typeName: "Pat",
      instantiatedTypes: map,
    })
  );
});

test("circular-simple", (t) => {
  type Circular = { next: Circular } | null;
  registerType("Circular");
  const map = __dumpInstantiatedIR<Circular>();
  t.snapshot(
    humanFriendlyDescription(map.get("Circular")!!.value, {
      typeName: "Circular",
      instantiatedTypes: map,
    })
  );
});

test("circular-complex", (t) => {
  type CircularA = { next: CircularB } | null;
  type CircularB = { next: CircularC } | null;
  type CircularC = { next: CircularA } | null;
  registerType("CircularC");
  const map = __dumpInstantiatedIR<CircularC>();
  t.snapshot(
    humanFriendlyDescription(map.get("CircularC")!!.value, {
      typeName: "CircularC",
      instantiatedTypes: map,
    })
  );
});

test("circular-complex-2", (t) => {
  type CircularA2 = { next: CircularB2 } | null;
  type CircularB2 = { next: CircularC2 } | null;
  type CircularC2 = { next: CircularB2 } | null;
  registerType("CircularA2");
  const map = __dumpInstantiatedIR<CircularA2>();
  t.snapshot(
    humanFriendlyDescription(map.get("CircularA2")!!.value, {
      typeName: "CircularA2",
      instantiatedTypes: map,
    })
  );
});
