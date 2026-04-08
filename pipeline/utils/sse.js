export function createSSEWriter(res, req) {
  // Disable response buffering for SSE
  req.socket?.setNoDelay?.(true);
  res.socket?.setNoDelay?.(true);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  let clientAborted = false;
  req.on('aborted', () => { clientAborted = true; });

  const isClosed = () => clientAborted || res.writableEnded || res.destroyed;

  return {
    write: (data) => {
      if (isClosed()) return;
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        res.flush?.();
      } catch { /* ignore */ }
    },
    get closed() { return isClosed(); },
    end: () => {
      if (!isClosed()) res.end();
    }
  };
}

export function startHeartbeat(writer, intervalMs = 30000) {
  const timer = setInterval(() => { writer.write({ type: 'heartbeat' }); }, intervalMs);
  return () => clearInterval(timer);
}
