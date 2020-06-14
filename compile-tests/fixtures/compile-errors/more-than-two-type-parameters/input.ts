import createValidator from "../../../../dist/typecheck.macro";
// @ts-ignore the Typescript definition file protects us from the macro being
// called with multiple type parameters, but people could ignore the warning/error
// and compile anyway
createValidator<A, B, C>();
