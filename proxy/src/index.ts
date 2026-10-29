// Cloudflare Worker entry point for the assistant proxy (logic in handle.ts).
import { handle, type Env } from './handle';

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
};
