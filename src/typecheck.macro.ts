import { createMacro, MacroError } from "babel-plugin-macros";
import type { MacroParams } from "babel-plugin-macros";
import { assertCalledWithTypeParameter } from "./utils";
import type { TypeParameter } from "@babel/types";
//import {assertIsArray, assertIsStringLiteralNode} from './utils'

function macroHandler({ references, state, babel }: MacroParams): void {
  references.default.forEach((path) => {
    const callExpr = path.parentPath;
    assertCalledWithTypeParameter(callExpr);
    /*
    const argumentsPath = referencePath.parentPath.get("arguments");
    assertIsArray(argumentsPath);
    const firstArgumentPath = argumentsPath[0];
    assertIsStringLiteralNode(firstArgumentPath.node);
    */
  });
}

export default createMacro(macroHandler);
