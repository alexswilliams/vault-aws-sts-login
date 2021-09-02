import fetch, { RequestInfo, RequestInit, Response } from "node-fetch";

// Comments are for compaitbility with node-fetch 3.

export async function fetchWithTimeout(
  url: RequestInfo,
  timeoutMillis: number,
  init?: RequestInit
): Promise<Response> {
  // const timeout = new AbortController();
  // const timeoutTimer = setTimeout(() => timeout.abort(), timeoutMillis);
  return fetch(url, {
    ...init,
    timeout: timeoutMillis /* signal: timeout.signal */,
  }); // .finally(() => clearTimeout(timeoutTimer));
}
