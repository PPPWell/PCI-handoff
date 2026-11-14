import { installPolyfills } from "@/lib/polyfills";
// Runs before the pages' own scripts start: the fills must exist before a click handler needs them.
installPolyfills();
