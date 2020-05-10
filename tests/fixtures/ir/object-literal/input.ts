import { generateIr } from "../../../../dist/typecheck.macro";

export default function () {
  return generateIr<{
    a: number;
    b: number | string;
    c: string;
    d?: number;
    e: { f: number };
    [key: number]: string;
  }>();
}
