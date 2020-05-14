import createValidator, {
  __dumpAllIR,
  __resetAllIR,
  register,
} from "../../../../dist/typecheck.macro";

export default () => {
  __resetAllIR;
  const v = createValidator<{
    foo: string;
    bar: string;
    [key: number]: string;
    [key: string]: string;
  }>();
  return __dumpAllIR;
};
