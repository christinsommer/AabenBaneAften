import OpenBaneApp from "./open-bane-app";

// The shell contains no user data; session data is fetched from /api/app.
export const dynamic = "force-static";

export default function Home() { return <OpenBaneApp />; }
