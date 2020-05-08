import { createMacro } from "babel-plugin-macros";
import type { MacroParams } from "babel-plugin-macros";
import { assertCalledWithTypeParameter } from "./utils";

function macroHandler({ references, state, babel }: MacroParams): void {
  references.default.forEach((path) => {
    const callExpr = path.parentPath;
    const typeParam = assertCalledWithTypeParameter(callExpr);
  });
}

export default createMacro(macroHandler);
