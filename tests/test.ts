import fs from "fs";
import path from "path";
import test from "ava";
import { transformFileAsync, transformFileSync } from "@babel/core";

const transformOptions = {
  plugins: ["babel-plugin-macros", "@babel/plugin-transform-typescript"],
};
const sourcesDir = path.join(__dirname, "fixtures");

const sources = fs.readdirSync(sourcesDir);
for (const source of sources) {
  const testName = path.basename(source, "ts");
  const fileName = path.join(sourcesDir, source);
    const { code } =  transformFileSync(fileName, transformOptions);
    test(testName, t => {
      const func = new Function("t", code)
      func(t)
      t.true(true)
    })
    /*
  test(testName, async (t) => {
    const { code } = await transformFileAsync(fileName, transformOptions);
    const func = new Function("t", code);
    console.log(code);
    func(t);
  });
  */
}
