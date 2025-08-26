const isDev = process.env.NODE_ENV === 'development';

const log = (...args) => {
  if (isDev) {
    console.log(...args);
  }
};

const warn = (...args) => {
  if (isDev) {
    console.warn(...args);
  }
};

const error = (...args) => {
  if (isDev) {
    console.error(...args);
  }
};

export default { log, warn, error };
