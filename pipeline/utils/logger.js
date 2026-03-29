import crypto from 'crypto';

function trimString(value, maxLength = 240) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...<len=${text.length}>`;
}

function normalizeError(error) {
  if (!error) return null;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: trimString(error.stack || '', 1200)
    };
  }
  return { message: trimString(error, 400) };
}

function sanitizeValue(value, depth = 0) {
  if (value == null) return value;
  if (value instanceof Error) return normalizeError(value);
  if (typeof value === 'string') return trimString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    if (depth >= 2) return `[array:${value.length}]`;
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (depth >= 2) {
      return {
        type: value.constructor?.name || 'Object',
        keys: entries.slice(0, 20).map(([key]) => key),
        keyCount: entries.length
      };
    }

    const result = {};
    for (const [key, entryValue] of entries.slice(0, 30)) {
      result[key] = sanitizeValue(entryValue, depth + 1);
    }
    if (entries.length > 30) {
      result.__truncatedKeys = entries.length - 30;
    }
    return result;
  }

  return trimString(String(value), 240);
}

function emitLog(level, payload) {
  const serialized = JSON.stringify(payload);
  if (level === 'error') {
    console.error(serialized);
    return;
  }
  if (level === 'warn') {
    console.warn(serialized);
    return;
  }
  console.log(serialized);
}

export function createLogger(baseFields = {}) {
  const base = sanitizeValue(baseFields);

  const write = (level, message, fields = {}) => {
    emitLog(level, {
      ts: new Date().toISOString(),
      level,
      message,
      ...base,
      ...sanitizeValue(fields)
    });
  };

  return {
    child(extraFields = {}) {
      return createLogger({ ...base, ...extraFields });
    },
    debug(message, fields) {
      write('debug', message, fields);
    },
    info(message, fields) {
      write('info', message, fields);
    },
    warn(message, fields) {
      write('warn', message, fields);
    },
    error(message, fields) {
      write('error', message, fields);
    }
  };
}

export function createRequestLogger(req, res, baseFields = {}) {
  const headerRequestId = req?.headers?.['x-request-id'];
  const requestId = typeof headerRequestId === 'string' && headerRequestId.trim()
    ? headerRequestId.trim()
    : crypto.randomUUID();

  if (req) req.requestId = requestId;
  if (res && !res.headersSent) {
    res.setHeader('X-Request-Id', requestId);
  }

  return createLogger({
    requestId,
    method: req?.method,
    path: req?.originalUrl || req?.url,
    ...baseFields
  });
}

export function attachResponseLogging(req, res, logger) {
  const startedAt = Date.now();

  req?.on?.('aborted', () => {
    logger.warn('Request aborted by client', {
      durationMs: Date.now() - startedAt
    });
  });

  res?.on?.('finish', () => {
    logger.info('Response finished', {
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  res?.on?.('close', () => {
    if (!res.writableEnded) {
      logger.warn('Response closed before completion', {
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt
      });
    }
  });

  return startedAt;
}

function summarizeAssetLike(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    return { type: 'array', count: value.length };
  }
  if (typeof value === 'string') {
    return { type: 'string', length: value.length };
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return { type: 'object', keys: keys.slice(0, 12), keyCount: keys.length };
  }
  return { type: typeof value };
}

export function summarizeText(value, previewLength = 0) {
  const text = String(value || '');
  const summary = { length: text.length };
  if (previewLength > 0 && text) {
    summary.preview = trimString(text.replace(/\s+/g, ' '), previewLength);
  }
  return summary;
}

export function summarizePipelineBody(body = {}) {
  const summary = {
    bodyKeys: Object.keys(body),
    projectId: body.projectId || null,
    episodeIndex: Number.isInteger(body.episodeIndex) ? body.episodeIndex : null,
    totalEpisodes: body.totalEpisodes ?? body.episodes ?? null,
    steps: Array.isArray(body.steps) ? body.steps : undefined,
    provider: body.provider || null,
    hasNovelText: Boolean(String(body.novelText || '').trim()),
    novelTextLength: String(body.novelText || '').trim().length,
    hasNovelAttachment: Boolean(body.novelAttachment || body.novelAttachmentUrl),
    screenplay: summarizeAssetLike(body.screenplay),
    storyBible: summarizeAssetLike(body.storyBible),
    assets: summarizeAssetLike(body.assets || body.assetLibrary)
  };

  return Object.fromEntries(
    Object.entries(summary).filter(([, value]) => value !== undefined)
  );
}

export function summarizeNormalization(normalized) {
  if (!normalized) return null;
  return {
    ok: !normalized.error,
    error: normalized.error || null,
    resultLength: String(normalized.result || '').length,
    rawLength: String(normalized.raw || '').length,
    details: normalized.details || null
  };
}

export function summarizeTokens(tokens) {
  return {
    input: tokens?.input || 0,
    output: tokens?.output || 0
  };
}

export function summarizeError(error) {
  return normalizeError(error);
}
