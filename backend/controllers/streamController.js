export const streamReview = async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const abortController = new AbortController();

  req.on('close', () => {
    abortController.abort();
    res.end();
  });

  try {
    // Mocking an async stream of tokens from an AI engine
    const mockTokens = ['Here ', 'is ', 'your ', 'code ', 'review: ', '\n\n', 'Looks ', 'great!'];
    
    for (const chunk of mockTokens) {
      if (abortController.signal.aborted) break;
      
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      
      // Simulate token generation delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!abortController.signal.aborted) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (error) {
    if (!abortController.signal.aborted) {
      res.write(`data: ${JSON.stringify({ error: 'Internal Server Error during streaming' })}\n\n`);
      res.end();
    }
  }
};
