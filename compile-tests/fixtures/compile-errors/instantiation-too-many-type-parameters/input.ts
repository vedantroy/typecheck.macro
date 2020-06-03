import createValidator, { registerType } from "../../../../dist/typecheck.macro";

interface Foo<T> {}
registerType("Foo");
createValidator<Foo<string, number>>();
