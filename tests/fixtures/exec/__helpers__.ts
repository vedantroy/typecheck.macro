import type { ExecutionContext } from "ava";
import { codeBlock } from "common-tags";

export const assertBooleanValidator = (
  t: ExecutionContext,
  validatorFunc: Function,
  info: { input?: unknown; i?: unknown; returns?: boolean; r?: boolean }
): void => {
  const hasOwn = Object.prototype.hasOwnProperty;
  function getXor<T>(longName: string, alias: string): T {
    if (hasOwn.call(info, longName) && hasOwn.call(info, alias)) {
      throw new Error(
        `Cannot specify both ${longName} and ${alias}. ${alias} is an alias for ${longName}`
      );
    }
    if (!hasOwn.call(info, longName) && !hasOwn.call(info, alias)) {
      throw new Error(
        `Must specify either ${longName} or ${alias}. ${alias} is an alias for ${longName}`
      );
    }
    if (hasOwn.call(info, longName))
      return info[longName as keyof typeof input] as T;
    if (hasOwn.call(info, alias)) return info[alias as keyof typeof input] as T;
    throw new Error(`This should be impossible to reach`);
  }
  const input = getXor<unknown>("input", "i");
  const expectedReturnValue = getXor<boolean>("returns", "r");
  const actualReturnValue = validatorFunc(input);
  if (actualReturnValue === expectedReturnValue) {
    t.pass();
  } else {
    t.fail(
      codeBlock`
      Validator function:
      ${validatorFunc}
      Returned: ${actualReturnValue.toString()}
      Expected: ${expectedReturnValue.toString()}`
    );
  }
};
