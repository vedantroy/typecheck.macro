import type { ExecutionContext } from "ava";
import { codeBlock } from "common-tags";
import { stringify } from "javascript-stringify";

export const testBooleanValidator = (
  t: ExecutionContext,
  validatorFunc: Function,
  opts: { inputs?: unknown[]; input?: unknown; returns?: boolean; r?: boolean }
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
  const expectedReturnValue = getXor<boolean>("returns", "r", true);
  for (const input of inputs) {
    const actualReturnValue = validatorFunc(input);
    if (actualReturnValue !== expectedReturnValue) {
      const stringified = stringify(input);
      if (stringified === undefined) {
        throw Error(`Failed to stringify value: ${input}`);
      }
      t.fail(codeBlock`
      For value: ${stringified}
      Validator function:
      ${validatorFunc}
      Returned: ${actualReturnValue.toString()}
      Expected: ${expectedReturnValue.toString()}
      `);
    }
  }
  t.pass();
};
