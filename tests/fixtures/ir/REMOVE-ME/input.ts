import createValidator, {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  createValidator<{ foo: number }>();
  return __dumpAllIR;
};
