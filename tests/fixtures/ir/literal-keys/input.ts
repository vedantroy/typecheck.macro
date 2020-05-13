import {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  interface LiteralKeys {
    hello: number;
    3: string;
  }
  register("LiteralKeys");
  return __dumpAllIR();
};
