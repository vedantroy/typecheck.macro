import createValidator, { registerType } from "../../dist/typecheck.macro";
import { testBooleanValidator as tBV } from "./__helpers__";
import test from "ava";

type PositiveNumber = number;
type NegativeNumber = number;

type NumberContainer = { pos?: PositiveNumber; neg?: NegativeNumber };
registerType("NumberContainer");

test("constraint-basic", (t) => {
  const x = createValidator<NumberContainer>(undefined, {
    constraints: {
      PositiveNumber: (x: number) => x > 0,
      NegativeNumber: function (x: number) {
        return x < 0;
      },
    },
  });

  tBV(t, x, {
    inputs: [{}, { pos: 5 }, { neg: -1 }, { pos: 5, neg: -1 }],
    returns: true,
  });

  tBV(t, x, {
    inputs: [
      null,
      undefined,
      { pos: "5" },
      { neg: "-1" },
      { pos: "5", neg: "-1" },
      { pos: -1 },
      { neg: 2 },
    ],
    returns: false,
  });
});

test("constraint-circular", (t) => {
  type LinkedList<T> = T & { next?: LinkedList<T> };
  type A = LinkedList<NumberContainer>;
  registerType("A");
  const x = createValidator<A>(undefined, {
    constraints: {
      PositiveNumber: (x: number) => x > 0,
      NegativeNumber: function (x: number) {
        return x < 0;
      },
    },
  });

  const a: A = { pos: 5, neg: -1 };
  const b: A = { pos: 1 };
  const c: A = { neg: -1 };
  a.next = b;
  b.next = c;
  c.next = a;

  tBV(t, x, {
    inputs: [a, b, c],
    returns: true,
  });

  c.neg = 2;

  tBV(t, x, {
    inputs: [a, b, c],
    returns: false,
  });
});

test("conflicting-var-names", (t) => {
  type MagnitudeLessThan5 = number;
  registerType("MagnitudeLessThan5");
  let p3 = 102;
  const x = createValidator<{ a: MagnitudeLessThan5 }>(undefined, {
    constraints: {
      MagnitudeLessThan5: (p0: number) => {
        let p1 = 100;
        let p2 = 101;
        p3;
        t.true(p1 === 100);
        t.true(p2 === 101);
        t.true(p3 === 102);
        return Math.abs(p0) < 5;
      },
    },
  });

  t.true(x({ a: 4 }));
  t.true(x({ a: -4 }));
  t.false(x({ a: 6 }));
  t.false(x({ a: -6 }));
});
