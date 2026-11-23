// One Spectral function for every check: functionOptions.check names the check in checks/.
import * as checks from './checks/index.js';

export default function zalando(document, options, context) {
  const check = checks[options?.check];
  if (typeof check !== 'function') throw new Error(`Unknown check "${options?.check}"`);
  return check(document, options, context) ?? [];
}
