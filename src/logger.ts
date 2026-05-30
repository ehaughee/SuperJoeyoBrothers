// Structured logger for Cloudflare Workers Logs
// All logs are plain objects so fields are indexed and filterable

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    level: LogLevel;
    message: string;
    [key: string]: unknown;
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    const entry: LogEntry = { level, message, ...context };
    switch (level) {
        case 'debug': console.debug(entry); break;
        case 'info':  console.info(entry); break;
        case 'warn':  console.warn(entry); break;
        case 'error': console.error(entry); break;
    }
}

export const logger = {
    debug: (message: string, context?: Record<string, unknown>) => log('debug', message, context),
    info:  (message: string, context?: Record<string, unknown>) => log('info', message, context),
    warn:  (message: string, context?: Record<string, unknown>) => log('warn', message, context),
    error: (message: string, context?: Record<string, unknown>) => log('error', message, context),
};
