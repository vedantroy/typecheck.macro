import createValidator, {
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

test("conflicting-var-names-detailed", (t) => {
  type MagnitudeLessThan5 = number;
  registerType("MagnitudeLessThan5");
  let p3 = 102;
  let errs = 104;
  let tPath = 105;
  let noErr = 106;
  let _noErr = 107;
  const x = createDetailedValidator<{ a: MagnitudeLessThan5 }>(undefined, {
    constraints: {
      MagnitudeLessThan5: (p0: number) => {
        let p1 = 100;
        let p2 = 101;
        p3;
        t.true(p1 === 100);
        t.true(p2 === 101);
        t.true(p3 === 102);
        t.true(errs == 104);
        t.true(tPath === 105);
        t.true(noErr === 106);
        t.true(_noErr === 107);
        return Math.abs(p0) < 5 ? null : "number with magnitude less than 5";
      },
    },
  });

  let validationErrs = [];
  t.true(x({ a: 4 }, validationErrs));
  t.true(x({ a: -4 }, validationErrs));
  t.deepEqual(validationErrs, []);

  t.false(x({ a: 6 }, validationErrs));
  t.snapshot(validationErrs);
});
