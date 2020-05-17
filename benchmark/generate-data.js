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
  // 100000 (1 million -- seems to give accurate results)
  for (let i = 0; i < 1000000; ++i) {
    data.push(faker.generate(schema));
  }
  fse.outputJson(path.join(generatedDataDir, schemaName), data);
}
