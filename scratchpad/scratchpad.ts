/**
 * I am the scratchpad!
 * Normally, debugging the macro is difficult because placing a "debugger" statement isn't sufficient
 * since the test files are compiled with babel into normal Javascript.
 * (and you can't make the Babel CLI stop on a debugger statement because in order to stop a debugger
 * statement, you have to use node --inspect-brk. Doing ./script.js where the script has a debugger
 * statement does nothing. Doing node --inspect-brk node_modules/.bin/babel doesn't work either, it
 * just crashes).
 *
 * However, this file isn't compiled with the babel CLI. Rather it's required using
 * @babel/register. So node --inspect-brk scratchpad.js will require this file
 * and compile it, while stopping on any debugger statements in the macro.
 *
 * All of this is to say. If you want to use a debugger statement inside the macro,
 * place the input code you want to debug here. And run "pnpm run scratchpad".
 */

import { createDetailedValidator } from "../dist/typecheck.macro";

const val = createDetailedValidator<
  | number
  | {
      a?: [
        number | { a: [number, Array<number | string>] },
        number,
        ...string[]
      ];
      b: "bar" | false | 42;
      c: Array<Array<number | boolean | "bar" | "zar">>;
    }
>();

const errs = [];
const result = val(null, errs);
console.log(result);
console.log(errs);
