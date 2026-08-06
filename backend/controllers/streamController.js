export const streamReview = async (req, res) => {
  // Preview-only demo endpooint. The AI engine exposes no SSE/streaming
  // endpoint yet, so the only implementation available is a clearly-marked
  // mock: every payload carries `_mock: true` plus an explicit warning so
  // clients can distinguish demo output from genuine AI analysis.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const abortController = new AbortController();

  req.on('close', () => {
    abortController.abort();
    if (!res.writableEnded) {
      res.end();
    }
  });

  try {
    // Lead with an explicit marker so clients can identify demo data before
    // any token is rendered.
    if (!abortController.signal.aborted) {
      res.write(
        `data: ${JSON.stringify({ _mock: true, _mockWarning: 'Preview-only demo stub. No real AI analysis is performed.' })}\n\n`,
      );
    }

    const mockTokens = ['Here ', 'is ', 'your ', 'code ', 'review: ', '\n\n', 'Looks ', 'great!'];

    for (const chunk of mockTokens) {
      if (abortController.signal.aborted) break;
      if (res.writableEnded) break;

      res.write(`data: ${JSON.stringify({ text: chunk, _mock: true })}\n\n`);

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!abortController.signal.aborted && !res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (error) {
    if (!abortController.signal.aborted && !res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({ error: 'Internal Server Error during streaming', _mock: true })}\n\n`,
      );
      res.end();
    }
  }
};