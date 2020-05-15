import { __dumpAllIR, register } from "../../../../dist/typecheck.macro";

/**
 * string/number/boolean literals work
 */

export default () => {
  interface LiteralType {
    hello: "world";
    foo: 42;
    bar: true;
  }
  register("LiteralType");
  return __dumpAllIR;
};
