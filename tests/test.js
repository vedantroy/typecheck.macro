const fs = require("fs");
const path = require("path");
const test = require("ava");

const sourcesDir = path.join(__dirname, "fixtures");

const sources = fs.readdirSync(sourcesDir);
for (const source of sources) {
  const testName = path.basename(source, ".ts")
  const fileName = path.join(sourcesDir, source);
  test(testName, (t) => {
    const testFunction = require(fileName).default;
    t.log(testFunction.toString());
    testFunction(t);
  });
}
