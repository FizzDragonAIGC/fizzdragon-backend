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

  let closed = false;
  req.on('close', () => { closed = true; });

  return {
    write: (data) => {
      if (!closed) {
        try {
          res.cork();
          res.write(`data: ${JSON.stringify(data)}\n\n`);
          process.nextTick(() => res.uncork());
        } catch { /* ignore */ }
      }
    },
    get closed() { return closed; },
    end: () => { if (!closed) res.end(); }
  };
}

export function startHeartbeat(writer, intervalMs = 30000) {
  const timer = setInterval(() => { writer.write({ type: 'heartbeat' }); }, intervalMs);
  return () => clearInterval(timer);
}
