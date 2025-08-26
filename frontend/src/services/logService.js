const isDev = process.env.NODE_ENV === 'development';
const redact = (arg) => {
  if (typeof arg === 'string') {
    return arg.replace(/token=([^\s&]+)/gi, 'token=[REDACTED]');
  }
  return arg;
};
const log = (...args) => {
  if (isDev) {
   console.log(...args.map(redact));
  }
};

const warn = (...args) => {
  if (isDev) {
    console.warn(...args.map(redact));
  }
};

const error = (...args) => {
  if (isDev) {
    console.error(...args.map(redact));
  }
};

export default { log, warn, error };
