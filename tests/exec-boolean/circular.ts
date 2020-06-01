import createValidator, { register } from "../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import test from "ava";
import { format } from "prettier";

test("circular", (t) => {
  type Circular = { next: Circular } | null;
  register("Circular");
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
});

test("circular-complex", (t) => {
  type Circular2 = {
    [key: string]: Circular2 | number;
    next: Circular2;
  } | null;
  register("Circular2");

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

test("linked-list", (t) => {
  type LinkedList<T> = T & { next: LinkedList<T> | null };
  type Person = { name: string };
  register("Person");
  register("LinkedList");

  const x = createValidator<LinkedList<Person>>();

  const robertNode: LinkedList<Person> = { name: "Robert", next: null };
  const vedNode: LinkedList<Person> = { name: "Ved", next: robertNode };

  tBV(t, x, {
    inputs: [vedNode, robertNode],
    returns: true,
  });
});
