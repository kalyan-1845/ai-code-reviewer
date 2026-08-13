export const streamReview = async (req, res) => {
  // Preview-only demo stub. The AI engine exposes no SSE/streaming endpoint
  // yet, so the only implementation available is a mock. Fail closed by
  // default: without the explicit opt-in flag the endpoint refuses to serve
  // fabricated output instead of presenting it as a real analysis.
  if (process.env.ENABLE_STREAM_PREVIEW !== 'true') {
    return res.status(404).json({
      error: 'Streaming review is a preview-only demo stub and is disabled. Set ENABLE_STREAM_PREVIEW=true to enable it.',
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const abortController = new AbortController();

  req.on('close', () => {
    abortController.abort();
    res.end();
  });

  try {
    // Lead with an explicit marker so clients can distinguish demo data from
    // genuine AI analysis before any token is rendered.
    if (!abortController.signal.aborted) {
      res.write(`data: ${JSON.stringify({ _mock: true, _mockWarning: 'Preview-only demo stub. No real AI analysis is performed.' })}\n\n`);
    }

    const mockTokens = ['Here ', 'is ', 'your ', 'code ', 'review: ', '\n\n', 'Looks ', 'great!'];

    for (const chunk of mockTokens) {
      if (abortController.signal.aborted) break;

      res.write(`data: ${JSON.stringify({ text: chunk, _mock: true })}\n\n`);

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!abortController.signal.aborted) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (error) {
    if (!abortController.signal.aborted) {
      res.write(`data: ${JSON.stringify({ error: 'Internal Server Error during streaming', _mock: true })}\n\n`);
      res.end();
    }
  }
};
