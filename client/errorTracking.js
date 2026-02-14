// PostHog Exception Tracking Module
// Handles global error tracking, exception reporting, and performance monitoring

class ErrorTracker {
  constructor() {
    this.initialized = false;
    this.errorCount = 0;
    this.errorBuffer = [];
    this.maxBufferSize = 50;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    // Global error handler for uncaught exceptions
    window.addEventListener('error', (event) => {
      this.captureError({
        type: 'uncaught_error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.captureError({
        type: 'unhandled_rejection',
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        timestamp: new Date().toISOString(),
      });
    });

    // Monitor WebSocket errors
    this.monitorWebSocketErrors();

    // Monitor canvas errors
    this.monitorCanvasErrors();

    console.log('✅ Error tracking initialized');
  }

  captureError(errorData) {
    this.errorCount++;

    // Add to local buffer
    this.errorBuffer.push(errorData);
    if (this.errorBuffer.length > this.maxBufferSize) {
      this.errorBuffer.shift();
    }

    // Send to PostHog if available
    if (window.posthog && window.posthog.capture) {
      try {
        window.posthog.capture('exception', {
          $exception_type: errorData.type,
          $exception_message: errorData.message,
          $exception_stack: errorData.stack,
          filename: errorData.filename,
          lineno: errorData.lineno,
          colno: errorData.colno,
          timestamp: errorData.timestamp,
          error_count: this.errorCount,
        });
      } catch (e) {
        console.error('Failed to capture error in PostHog:', e);
      }
    }

    // Log to console for development
    console.error('🚨 Error captured:', errorData);
  }

  captureMessage(message, level = 'info', context = {}) {
    if (window.posthog && window.posthog.capture) {
      try {
        window.posthog.capture('log_message', {
          message,
          level,
          ...context,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        console.error('Failed to capture message in PostHog:', e);
      }
    }
  }

  monitorWebSocketErrors() {
    const originalWebSocket = window.WebSocket;
    const self = this;

    window.WebSocket = class extends originalWebSocket {
      constructor(url, protocols) {
        super(url, protocols);

        this.addEventListener('error', (event) => {
          self.captureError({
            type: 'websocket_error',
            message: `WebSocket error: ${url}`,
            url,
            timestamp: new Date().toISOString(),
          });
        });

        this.addEventListener('close', (event) => {
          if (event.code !== 1000 && event.code !== 1001) {
            self.captureError({
              type: 'websocket_close',
              message: `WebSocket closed with code ${event.code}: ${event.reason}`,
              code: event.code,
              reason: event.reason,
              url,
              timestamp: new Date().toISOString(),
            });
          }
        });
      }
    };
  }

  monitorCanvasErrors() {
    const self = this;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.getContext = function (contextType, ...args) {
      try {
        return originalGetContext.call(this, contextType, ...args);
      } catch (error) {
        self.captureError({
          type: 'canvas_error',
          message: `Canvas context error: ${error.message}`,
          contextType,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        });
        throw error;
      }
    };
  }

  // Utility to wrap async functions with error handling
  wrapAsync(fn, context = '') {
    const self = this;
    return async function (...args) {
      try {
        return await fn.apply(this, args);
      } catch (error) {
        self.captureError({
          type: 'async_function_error',
          message: error.message,
          context,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        });
        throw error;
      }
    };
  }

  // Utility to wrap sync functions with error handling
  wrapSync(fn, context = '') {
    const self = this;
    return function (...args) {
      try {
        return fn.apply(this, args);
      } catch (error) {
        self.captureError({
          type: 'sync_function_error',
          message: error.message,
          context,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        });
        throw error;
      }
    };
  }

  // Get error summary for debugging
  getErrorSummary() {
    return {
      totalErrors: this.errorCount,
      bufferedErrors: this.errorBuffer.length,
      recentErrors: this.errorBuffer.slice(-10),
    };
  }
}

// Create global instance
window.errorTracker = new ErrorTracker();
