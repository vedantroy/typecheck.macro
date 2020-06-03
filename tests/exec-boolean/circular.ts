import createValidator, { registerType } from "../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import test from "ava";

test("circular", (t) => {
  type Circular = { next: Circular } | null;
  registerType("Circular");
  const circular = createValidator<Circular>();
  const a: Circular = { next: null };
  const b: Circular = { next: a };
  a.next = b;
  tBV(t, circular, {
    inputs: [null, { next: null }, { next: { next: { next: null } } }, a, b],
    returns: true,
  });

  tBV(t, circular, {
    inputs: [undefined, {}],
    returns: false,
  });

  const c: Circular = { next: a };
  b.next = c;
  tBV(t, circular, {
    inputs: [c],
    returns: true,
  });
});

test("circular-complex", (t) => {
  type Circular2 = {
    [key: string]: Circular2 | number;
    next: Circular2;
  } | null;
  registerType("Circular2");

  const a: Circular2 = { next: null };
  const invalid = { next: a, world: "not-a-number" };
  // @ts-ignore
  a.next = invalid;

  const circular = createValidator<Circular2>();
  tBV(t, circular, {
    inputs: [undefined, {}, a, invalid],
    returns: false,
  });
});

test("circular-complex-2", (t) => {
  type CircularA2 = { next: CircularB2 } | null;
  type CircularB2 = { next: CircularC2 } | null;
  type CircularC2 = { next: CircularB2 } | null;
  registerType("CircularA2");

  let a: CircularA2 = { next: null };
  let b: CircularB2 = { next: null };
  let c: CircularC2 = { next: null };
  a.next = b;
  b.next = c;
  c.next = b;

  const x = createValidator<CircularA2>();
  const y = createValidator<CircularB2>();
  const z = createValidator<CircularC2>();

  const trueInputs = {
    inputs: [a, b, c],
    returns: true,
  };

  tBV(t, x, trueInputs);
  tBV(t, y, trueInputs);
  tBV(t, z, trueInputs);
});

test("linked-list", (t) => {
  type LinkedList<T> = T & { next: LinkedList<T> | null };
  type Person = { name: string };
  registerType("Person");
  registerType("LinkedList");

  const x = createValidator<LinkedList<Person>>();

  const robertNode: LinkedList<Person> = { name: "Robert", next: null };
  const vedNode: LinkedList<Person> = { name: "Ved", next: robertNode };

  tBV(t, x, {
    inputs: [vedNode, robertNode],
    returns: true,
  });

  // @ts-ignore
  vedNode.next = 3;
  robertNode.next = vedNode;
  tBV(t, x, {
    inputs: [vedNode, robertNode],
    returns: false,
  });
});
