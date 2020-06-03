import createValidator, {
  registerType,
  createDetailedValidator,
} from "../../dist/typecheck.macro";
import test, { ExecutionContext } from "ava";

type Circular = { next: Circular } | null;
registerType("Circular");

const a: Circular = { next: null };
const b: Circular = { next: a };
a.next = b;

const nestedNotCircular: Circular = { next: { next: null } };

function testRefsEnabled(t: ExecutionContext, f: Function) {
  t.true(f(nestedNotCircular));
  t.true(f(a));
  t.true(f(b));
}

function testRefsNotEnabled(t: ExecutionContext, f: Function) {
  t.true(f(nestedNotCircular));
  const expectation = {
    instanceOf: RangeError,
    message: "Maximum call stack size exceeded",
  };
  t.throws(() => f(a), expectation);
  t.throws(() => f(b), expectation);
}

test("option-circular-refs", (t) => {
  const x = createValidator<Circular>({ circularRefs: true });
  testRefsEnabled(t, x);

  const y = createValidator<Circular>({ circularRefs: false });
  testRefsNotEnabled(t, y);

  const a = createDetailedValidator<Circular>({
    circularRefs: true,
    expectedValueAsIR: true,
  });
  testRefsEnabled(t, a);

  const b = createDetailedValidator<Circular>({
    circularRefs: false,
    expectedValueAsIR: true,
  });
  testRefsNotEnabled(t, b);
});
