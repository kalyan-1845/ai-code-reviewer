// Crash handler registration for the backend process.
//
// Clean, intentional shutdown (SIGINT/SIGTERM) exits with code 0 via the
// normal onShutdown path. Crash paths (uncaught exceptions and unhandled
// rejections) must exit non-zero so supervisors (Docker restart policies,
// PM2, systemd) and CI detect the failure and restart the process.
export function registerCrashHandlers(handleShutdown, logger = console) {
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
    if (err.stack) {
      logger.error(err.stack);
    }
    handleShutdown(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason instanceof Error ? reason.message : reason);
    if (reason instanceof Error && reason.stack) {
      logger.error(reason.stack);
    }
    handleShutdown(1);
  });
}
