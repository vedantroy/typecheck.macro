import { createMacro } from "babel-plugin-macros";
import type { MacroParams } from "babel-plugin-macros";
import { getTypeParameter } from "./macro-assertions";
import generateTypeIR from "./type-ir/astToTypeIR";

/* Strategy: When we encounter a type, we perform double dispatch on it? We can use manual recursion
or path traversal. We serialize this type into some useful data structure. Then we have 2 options:
1 (easier): have a generic function that can take in this data structure and validate an object against it
- this is like the reverse of existing libraries
2. (harder): convert this generic data structure into an optimized function that is hand tailored for that data structure
*/

function macroHandler({ references, state, babel }: MacroParams): void {
  references.default.forEach((path) => {
    const callExpr = path.parentPath;
    const typeParam = getTypeParameter(callExpr);
    debugger;
    // gen type IR
    generateTypeIR(typeParam.node);
    // type IR to validator
  });
}

export default createMacro(macroHandler);
