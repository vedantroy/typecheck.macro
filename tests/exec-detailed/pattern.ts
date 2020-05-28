import { createDetailedValidator } from "../../dist/typecheck.macro";
import { format } from "prettier";
import test from "ava";

test("pattern-basic", (t) => {
  const x = createDetailedValidator<{
    3: number;
    hello: 42;
    'zoo\n"ba': 42;
    [key: string]: number;
  }>();
  console.log(format(x.toString()));
  let errs = [];
  x({}, errs);
  console.log(errs);
  errs = [];
  x({ 5: "world", 'zo"om': "zoo", 'zoo\n"ba': 43 }, errs);
  console.log(errs);
  t.pass();
});
