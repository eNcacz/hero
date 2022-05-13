import * as Path from 'path';
import * as Os from 'os';

export default {
  disableMitm: booleanOrUndefined(process.env.ULX_DISABLE_MITM),
  showChrome: booleanOrUndefined(process.env.ULX_SHOW_CHROME),
  disableDevtools: booleanOrUndefined(process.env.ULX_DISABLE_DEVTOOLS),
  noChromeSandbox: booleanOrUndefined(process.env.ULX_NO_CHROME_SANDBOX),
  disableGpu: booleanOrUndefined(process.env.ULX_DISABLE_GPU),
};

export const dataDir = process.env.ULX_DATA_DIR || Path.join(Os.tmpdir(), '.ulixee'); // transferred to static variable below class definition

function booleanOrUndefined(envValue): boolean | undefined {
  if (envValue === undefined) return undefined;
  return Boolean(JSON.parse(envValue ?? 'false'));
}
