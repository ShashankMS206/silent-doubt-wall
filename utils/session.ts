// Random ID kept in this browser only. Never linked to a name or account.
export function getSessionId(): string {
  try {
    let id = localStorage.getItem("sdw_session");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("sdw_session", id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}