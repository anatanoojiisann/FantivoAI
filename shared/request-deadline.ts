export class RequestTimeoutError extends Error {
  constructor() { super("Request deadline exceeded"); }
}

// Covers both response headers and body consumption, including transports that
// do not implement AbortSignal (for example some service binding adapters).
export async function withRequestDeadline<T>(milliseconds: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new RequestTimeoutError());
      controller.abort();
    }, milliseconds);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
