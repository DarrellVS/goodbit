export function withTimeout<T>(promise: Promise<T>, timeoutMs = 60_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error('Operation timeout'), { code: 'TIMEOUT' })), timeoutMs);
    promise.then((v) => { clearTimeout(timer); resolve(v); }).catch((e) => { clearTimeout(timer); reject(e); });
  });
}


