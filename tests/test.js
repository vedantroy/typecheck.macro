const fs = require("fs");
const path = require("path");
const test = require("ava");
const { stripIndents } = require("common-tags");

// Start directory name with _ so Ava ignores it
const tempDir = path.join(__dirname, "_temp");
if (fs.existsSync(tempDir)) {
  throw Error(stripIndents`${tempDir} should not exist prior to running the tests.
              It is used to store test file artifacts and is deleted after tests are run.`);
}
fs.mkdirSync(tempDir);

test.after.always(() => {
  fs.rmdirSync(tempDir, { recursive: true });
});

const testsDir = path.join(__dirname, "fixtures");

const fileNames = fs.readdirSync(testsDir);
for (const fileName of fileNames) {
  const absolutePath = path.join(testsDir, fileName);
  const testName = fileName.slice(0, -".ts".length);
  test(testName, (t) => {
    // Solve: https://github.com/kentcdodds/babel-plugin-macros#babel-cache-problem
    // by copying the test file to a temporary directory each time
    // Apparently this confuses the Babel cache?? sufficiently?
    // If the caching improves in the future, add a random string
    // to the file before copying
    const copyPath = path.join(tempDir, fileName);
    fs.copyFileSync(absolutePath, copyPath);
    const testFunction = require(copyPath).default;
    t.log(testFunction.toString());
    testFunction(t);
  });
}
