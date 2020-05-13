import {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  type Basic = string[];
  register("Basic");
  return __dumpAllIR;
};
