const faker = require("json-schema-faker");
const fse = require("fs-extra");
const path = require("path");

const schemasDir = path.join(__dirname, "schemas");
const generatedDataDir = path.join(__dirname, "generated");

const benchmarkNames = [];

for (const schemaName of fse.readdirSync(schemasDir)) {
  const schema = JSON.parse(
    fse.readFileSync(path.join(schemasDir, schemaName))
  );
  benchmarkNames.push(schemaName.slice(0, -".json".length));
  const data = [];
  const numFakes = 5000000; //5000000;
  const onePercent = numFakes / 100;
  let percentSoFar = 0;
  // 100000 (1 million -- seems to give accurate results)
  for (let i = 0; i < numFakes; ++i) {
    if (i % onePercent === 0) {
      console.log(`${++percentSoFar}%`);
    }
    data.push(faker.generate(schema));
  }
  fse.outputJson(path.join(generatedDataDir, schemaName), data);
}
