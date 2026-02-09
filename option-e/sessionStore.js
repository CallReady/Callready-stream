const sessions = new Map();

function getCallSid(req) {
  if (req && req.body && req.body.CallSid) return String(req.body.CallSid);
  if (req && req.query && req.query.CallSid) return String(req.query.CallSid);
  return "";
}

function newSession(callSid) {
  const now = Date.now();
  return {
    callSid: String(callSid || ""),
    phase: "start",
    slots: {},
    retries: {},
    createdAt: now,
    updatedAt: now,
  };
}

function touchSession(session) {
  if (!session) return session;
  session.updatedAt = Date.now();
  return session;
}

function getOrCreateSession(req) {
  const callSid = getCallSid(req);

  if (!callSid) {
    return newSession("");
  }

  if (!sessions.has(callSid)) {
    sessions.set(callSid, newSession(callSid));
  }

  return sessions.get(callSid);
}

function saveSession(session) {
  if (!session || !session.callSid) return;
  touchSession(session);
  sessions.set(session.callSid, session);
}

function clearSession(callSid) {
  if (!callSid) return;
  sessions.delete(String(callSid));
}

module.exports = {
  getOrCreateSession,
  saveSession,
  clearSession,
  getCallSid,
};
