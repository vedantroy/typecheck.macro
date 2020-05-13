import {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  interface LiteralType {
    hello: "world";
    foo: 42;
    bar: true;
  }
  register("LiteralType");
  return __dumpAllIR;
};
