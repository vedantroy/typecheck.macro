import {
  registerType,
  createDetailedValidator,
} from "../../dist/typecheck.macro";
import test from "ava";

type PositiveNumber = number;
type NegativeNumber = number;

type NumberContainer = { pos?: PositiveNumber; neg?: NegativeNumber };
registerType("NumberContainer");

test("constraint-error-reporting", (t) => {
  const x = createDetailedValidator<NumberContainer>(
    { expectedValueFormat: "type-ir" },
    {
      constraints: {
        PositiveNumber: (x: number) => {
          return x > 0 ? null : "positive number";
        },
        NegativeNumber: function (x: number) {
          return x < 0 ? null : "negative number";
        },
      },
    }
  );

  let errs = [];
  t.true(x({}, errs));
  t.true(x({ pos: 5 }, errs));
  t.true(x({ neg: -1 }, errs));
  t.true(x({ pos: 5, neg: -1 }, errs));
  t.deepEqual(errs, []);

  t.false(x(null, errs));
  t.snapshot(errs);
  errs = [];
  t.false(x({ pos: "5" }, errs));
  t.snapshot(errs);
  errs = [];
  t.false(x({ pos: -1 }, errs));
  t.snapshot(errs);
});

test("constraint-circular", (t) => {
  type LinkedList<T> = T & { next?: LinkedList<T> };
  registerType("LinkedList");
  const x = createDetailedValidator<LinkedList<NumberContainer>>(undefined, {
    constraints: {
      PositiveNumber: (x: number) => {
        return x > 0 ? null : "positive number";
      },
      NegativeNumber: function (x: number) {
        return x < 0 ? null : "negative number";
      },
    },
  });

  type A = LinkedList<NumberContainer>;

  const a: A = { pos: 5, neg: -1 };
  const b: A = { pos: 1 };
  const c: A = { neg: -1 };
  a.next = b;
  b.next = c;
  c.next = a;

  let errs = [];
  t.true(x(a, errs));
  t.true(x(b, errs));
  t.true(x(c, errs));
  t.deepEqual(errs, []);

  c.neg = 2;
  t.false(x(a, errs));
  t.snapshot(errs);
  errs = [];
  t.false(x(b, errs));
  t.snapshot(errs);
  errs = [];
  t.false(x(c, errs));
  t.snapshot(errs);
});
