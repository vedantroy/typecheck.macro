const fs = require("fs-extra");
const path = require("path");
const test = require("ava");
const { stripIndents } = require("common-tags");

const CompileErrorTest = {
  InputFile: "input.ts",
  CompileErrorFile: "compile_error.ts",
};

// Ava ignores directories named fixtures or starting with _
const testsDir = path.join(__dirname, "fixtures");
const tempDir = path.join(__dirname, "_temp");

if (fs.existsSync(tempDir)) {
  throw Error(stripIndents`${tempDir} should not exist prior to running the tests.
              It is used to store test file artifacts and is deleted after tests are run.`);
}
fs.mkdirSync(tempDir);

test.after.always(() => {
  fs.rmdirSync(tempDir, { recursive: true });
});

const fileNames = fs.readdirSync(testsDir);
for (const filePath of fileNames) {
  test(filePath, (t) => {
    const absolutePath = path.join(testsDir, filePath);
    const destPath = path.join(tempDir, filePath);
    fs.copySync(absolutePath, destPath);
    const stats = fs.statSync(absolutePath);

    if (stats.isDirectory()) {
      const errorMessageSubstring = require(path.join(
        destPath,
        CompileErrorTest.CompileErrorFile
      )).default;
      // https://makandracards.com/makandra/15879-javascript-how-to-generate-a-regular-expression-from-a-string
      // Don't want special characters in the substring to mess up the resulting regex
      const errorMessageSubstringEscaped = errorMessageSubstring.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
      const substringRegex = new RegExp(`.*${errorMessageSubstringEscaped}.*`);
      t.throws(() => require(path.join(destPath, CompileErrorTest.InputFile)), {
        name: "MacroError",
        message: substringRegex,
      });
    } else {
      const testFunction = require(destPath).default;
      testFunction(t);
    }
  });
}
