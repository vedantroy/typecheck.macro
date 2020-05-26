import type { ExecutionContext } from "ava";
import { codeBlock } from "common-tags";
import { stringify } from "javascript-stringify";
import { format } from "prettier";

export const testBooleanValidator = (
  t: ExecutionContext,
  validatorFunc: Function,
  opts: Readonly<{
    inputs?: unknown[];
    input?: unknown;
    returns?: boolean;
    r?: boolean;
  }>
): void => {
  const hasOwn = Object.prototype.hasOwnProperty;
  function getXor<T>(prop1: string, prop2: string, isAlias: boolean): T {
    const aliasMessage = `${prop2} is an alias for ${prop1}`;
    if (hasOwn.call(opts, prop1) && hasOwn.call(opts, prop2)) {
      throw new Error(
        `Cannot specify both ${prop1} and ${prop2}. ${
          isAlias ? aliasMessage : ""
        }`
      );
    }
    if (!hasOwn.call(opts, prop1) && !hasOwn.call(opts, prop2)) {
      throw new Error(
        `Must specify either ${prop1} or ${prop2}. ${
          isAlias ? aliasMessage : ""
        }`
      );
    }
    if (hasOwn.call(opts, prop1)) return opts[prop1 as keyof typeof opts] as T;
    if (hasOwn.call(opts, prop2)) return opts[prop2 as keyof typeof opts] as T;
    throw new Error(`This should be impossible to reach`);
  }
  const unresolvedInputs = getXor<unknown[] | unknown>(
    "inputs",
    "input",
    false
  );
  const inputs = Array.isArray(unresolvedInputs)
    ? unresolvedInputs
    : [unresolvedInputs];
  if (inputs.length === 0) throw Error(`inputs had length 0`);
  const safeStringify = (value: unknown) => {
    const stringified = stringify(value);
    if (stringified === undefined)
      throw Error(`Failed to stringify value: ${value}`);
    return stringified;
  };
  const expectedReturnValue = getXor<boolean>("returns", "r", true);
  for (const input of inputs) {
    const actualReturnValue = validatorFunc(input);
    if (actualReturnValue !== expectedReturnValue) {
      const stringifiedInput = safeStringify(input);
      const stringifiedActual = safeStringify(actualReturnValue);
      t.fail(codeBlock`
      For value: ${stringifiedInput}
      Validator function:
      ${validatorFunc.toString()}
      Returned: ${stringifiedActual}
      Expected: ${expectedReturnValue.toString()}
      `);
    }
  }
  t.pass();
};

export function snapshotFunction(t: ExecutionContext, f: Function) {
  t.snapshot(format(f.toString(), { parser: "babel" }));
}
