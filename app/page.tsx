import OpenBaneApp from "./open-bane-app";

// Render per request so framework scripts receive the fresh CSP nonce.
export const dynamic = "force-dynamic";

export default function Home() { return <OpenBaneApp />; }
