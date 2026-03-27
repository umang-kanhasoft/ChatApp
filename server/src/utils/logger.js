import util from 'node:util';

const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const resolveLevel = () => {
  const fallback = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
  const configured = String(process.env.LOG_LEVEL || fallback)
    .trim()
    .toLowerCase();

  return LOG_LEVELS[configured] ?? LOG_LEVELS.info;
};

const activeLevel = resolveLevel();

const serializeValue = (value) => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, serializeValue(entryValue)]),
    );
  }

  return value;
};

const writeLog = (level, message, meta = {}) => {
  if (LOG_LEVELS[level] < activeLevel) {
    return;
  }

  const payload = {
    level,
    time: new Date().toISOString(),
    message,
    ...serializeValue(meta),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    process.stderr.write(`${line}\n`);
    return;
  }

  process.stdout.write(`${line}\n`);
};

const buildLogger = (baseMeta = {}) => ({
  debug(message, meta = {}) {
    writeLog('debug', message, { ...baseMeta, ...meta });
  },
  info(message, meta = {}) {
    writeLog('info', message, { ...baseMeta, ...meta });
  },
  warn(message, meta = {}) {
    writeLog('warn', message, { ...baseMeta, ...meta });
  },
  error(message, meta = {}) {
    writeLog('error', message, { ...baseMeta, ...meta });
  },
  child(meta = {}) {
    return buildLogger({ ...baseMeta, ...serializeValue(meta) });
  },
  inspect(value) {
    return util.inspect(value, { depth: 5, breakLength: 120 });
  },
});

export const logger = buildLogger();
