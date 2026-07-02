import winston from 'winston';

const { combine, timestamp, printf, colorize } = winston.format;

const myFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level}]: ${message}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: combine(
    timestamp(),
    process.env.NODE_ENV === 'production' ? winston.format.json() : combine(colorize(), myFormat)
  ),
  transports: [
    new winston.transports.Console()
  ],
});

export default logger;
