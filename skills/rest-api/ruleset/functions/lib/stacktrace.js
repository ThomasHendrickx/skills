// #177: text that looks like a stack trace (Java, Kotlin, Python, Node.js, Go, .NET, PHP, Ruby).
const PATTERNS = [
  /\bat [\w$.<>]+\([\w$]+\.(?:java|kt|scala|groovy):\d+\)/,
  /\bat [\w$.<>]+\((?:Native Method|Unknown Source)\)/,
  /Exception in thread "/,
  /Traceback \(most recent call last\)/,
  /File "[^"]+", line \d+, in /,
  /\n\s+at (?:[\w$.<>\s[\]]+ )?\(?(?:file:\/\/)?(?:\/|[A-Za-z]:\\|node:)[^\s)]*:\d+:\d+\)?/,
  /goroutine \d+ \[[a-z ]+\]:/,
  /\.go:\d+ \+0x[0-9a-f]+/,
  /\bat [\w.<>`]+\([^)]*\) in [^\n]+:line \d+/,
  /Stack trace:\s*\n#0 /,
  /#\d+ \/[^\s(]+\.php\(\d+\)/,
  /from \/[^\s:]+\.rb:\d+:in /,
];

export const looksLikeStackTrace = (text) => typeof text === 'string' && PATTERNS.some((re) => re.test(text));

export const STACK_FIELDS = new Set(['stack_trace', 'stacktrace', 'traceback', 'backtrace', 'stack_frames', 'exception_stack']);

// Names that mean a stack trace only in an error payload.
export const ERROR_STACK_FIELDS = new Set(['stack', 'trace', 'exception', 'exception_class', 'exception_type', 'cause_trace']);
