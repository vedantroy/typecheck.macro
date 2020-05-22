const fs = require("fs-extra");
const path = require("path");
const test = require("ava");

const CompileErrorTest = {
  Input: "input.ts",
  Error: "compile_error.ts",
};

// Ava ignores directories named fixtures or starting with _
const testsDirName = "fixtures";
const testsDirPath = path.join(__dirname, testsDirName);

const compileTestsDirName = "compile-errors";
const compileTestsDirPath = path.join(testsDirPath, compileTestsDirName);
const compileErrorTests = fs.readdirSync(compileTestsDirPath);
for (const compileErrorTest of compileErrorTests) {
  test(compileErrorTest, (t) => {
    const testPath = path.join(compileTestsDirPath, compileErrorTest);
    const errorMessageSubstring = require(path.join(
      testPath,
      //path.join(compileTestsDirPath, compileErrorTest),
      CompileErrorTest.Error
    )).default;
    // https://makandracards.com/makandra/15879-javascript-how-to-generate-a-regular-expression-from-a-string
    // Don't want special characters in the substring to mess up the resulting regex
    const errorMessageSubstringEscaped = errorMessageSubstring.replace(
      /[-\/\\^$*+?.()|[\]{}]/g,
      "\\$&"
    );
    const substringRegex = new RegExp(`.*${errorMessageSubstringEscaped}.*`);
    t.throws(() => require(path.join(testPath, CompileErrorTest.Input)), {
      name: "MacroError",
      message: substringRegex,
    });
  });
}