/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of the deployed assistant proxy (proxy/); unset in development. */
  readonly VITE_AGENT_PROXY_URL?: string;
}
