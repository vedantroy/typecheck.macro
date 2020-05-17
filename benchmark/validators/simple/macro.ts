import createValidator from "../../../dist/typecheck.macro";

export default createValidator<{ isCat: boolean; legs: number }>();
