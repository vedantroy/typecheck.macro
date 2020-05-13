import {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  interface IndexSignatures {
    [key: string]: string | number;
    [key: number]: number;
  }
  register("IndexSignatures");
  return __dumpAllIR;
};
