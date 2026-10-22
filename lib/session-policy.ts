export function sessionPolicy(role: string) {
  return role === 'admin'
    ? {idleMs:15 * 60_000, absoluteMs:4 * 60 * 60_000}
    : {idleMs:30 * 60_000, absoluteMs:8 * 60 * 60_000};
}
