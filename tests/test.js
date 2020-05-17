const fs = require("fs-extra");
const path = require("path");
const test = require("ava");
const isEqual = require("lodash.isequal");
const { stripIndents } = require("common-tags");

// TODO: Add comprehensive CLI options to run a specific test suite
// TODO: There's some general code duplication, get rid of it
// TODO: Use snapshots instead of ad-hoc mechanism?
const OVERWRITE_IR =
  process.argv.length == 3 && process.argv[2] === "overwrite-ir";

const CompileErrorTest = {
  Input: "input.ts",
  Error: "compile_error.ts",
};

const IrTest = {
  GenerateIr: "input.ts",
  GeneratedIr: "ir.json",
  FailingIr: "ir.debug.json",
};

// Ava ignores directories named fixtures or starting with _
const testsDirName = "fixtures";
const tempDirName = "_temp";
const testsDirPath = path.join(__dirname, testsDirName);
const tempDirPath = path.join(__dirname, tempDirName);

function removeTempDir() {
  fs.rmdirSync(tempDirPath, { recursive: true });
}

if (fs.existsSync(tempDirPath)) {
  console.warn(stripIndents`${tempDirPath} should not exist prior to running the tests.
              It is used to store test file artifacts and is deleted after tests are run.`);
  removeTempDir();
}
fs.mkdirSync(tempDirPath);

test.after.always(() => {
  removeTempDir();
});

function copyToTestsDir(path) {
  const tempPath = path.replace(testsDirName, tempDirName);
  fs.copySync(path, tempPath);
  return tempPath;
}

const compileTestsDirName = "compile-errors";
const compileTestsDirPath = path.join(testsDirPath, compileTestsDirName);
const compileErrorTests = fs.readdirSync(compileTestsDirPath);
for (const compileErrorTest of compileErrorTests) {
  test(compileErrorTest, (t) => {
    const tempPath = copyToTestsDir(
      path.join(compileTestsDirPath, compileErrorTest)
    );
    const errorMessageSubstring = require(path.join(
      tempPath,
      CompileErrorTest.Error
    )).default;
    // https://makandracards.com/makandra/15879-javascript-how-to-generate-a-regular-expression-from-a-string
    // Don't want special characters in the substring to mess up the resulting regex
    const errorMessageSubstringEscaped = errorMessageSubstring.replace(
      /[-\/\\^$*+?.()|[\]{}]/g,
      "\\$&"
    );
    const substringRegex = new RegExp(`.*${errorMessageSubstringEscaped}.*`);
    t.throws(() => require(path.join(tempPath, CompileErrorTest.Input)), {
      name: "MacroError",
      message: substringRegex,
    });
  });
}

const irTestsDirName = "ir";
const irTestsDirPath = path.join(testsDirPath, irTestsDirName);
const irTests = fs.readdirSync(irTestsDirPath);
for (const irTest of irTests) {
  test(irTest, (t) => {
    const testPath = path.join(irTestsDirPath, irTest);
    const tempPath = copyToTestsDir(testPath);
    const generatedIr = require(path.join(
      tempPath,
      IrTest.GenerateIr
    )).default();
    const irFilePath = path.join(irTestsDirPath, irTest, IrTest.GeneratedIr);
    if (!fs.existsSync(irFilePath) || OVERWRITE_IR) {
      // this is a newly created test,
      // so there's nothing to compare the generated ir to
      fs.writeFileSync(irFilePath, JSON.stringify(generatedIr, null, 2));
      t.pass();
    } else {
      const previouslyGeneratedIr = require(path.join(
        tempPath,
        IrTest.GeneratedIr
      ));
      if (!isEqual(previouslyGeneratedIr, generatedIr)) {
        fs.writeFileSync(
          path.join(testPath, IrTest.FailingIr),
          JSON.stringify(generatedIr, null, 2)
        );
        t.fail(
          `Generated ir was not equal to existing ir. Broken ir written to ${IrTest.FailingIr}`
        );
      } else {
        t.pass();
      }
    }
  });
}

const execTestsDirName = "exec";
const execTestsDirPath = path.join(testsDirPath, execTestsDirName);
const execTests = fs.readdirSync(execTestsDirPath);
const helperFile = "__helpers__.ts";
copyToTestsDir(execTestsDirPath, helperFile);
for (const execTest of execTests) {
  if (execTest === helperFile) continue;
  test("exec-" + path.basename(execTest, ".ts"), (t) => {
    const testPath = path.join(execTestsDirPath, execTest);
    const tempPath = copyToTestsDir(testPath);
    const testFunc = require(tempPath).default;
    testFunc(t);
  });
}
