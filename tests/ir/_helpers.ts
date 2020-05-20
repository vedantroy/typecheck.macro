import path from "path";

export function testName(fullPath: string): string {
  return path.basename(fullPath, ".js");
}
