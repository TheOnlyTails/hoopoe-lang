import { hoopoeProtocolDisplay } from "std/box";

export const print = (x: unknown) => process.stdout.write(hoopoeProtocolDisplay(x).v);
export const println = (x: unknown) => console.log(hoopoeProtocolDisplay(x).v);
