const sessions = new Map();

function getCallSid(req) {
  if (req && req.body && req.body.CallSid) return String(req.body.CallSid);
  if (req && req.query && req.query.CallSid) return String(req.query.CallSid);
  return "";
}

function getOrCreateSession(req) {
  const callSid = getCallSid(req);
  if (!callSid) {
    return { callSid: "", step: "start", tries: 0, createdAt: Date.now() };
  }

  if (!sessions.has(callSid)) {
    sessions.set(callSid, { callSid, step: "start", tries: 0, createdAt: Date.now() });
  }

  return sessions.get(callSid);
}

function saveSession(session) {
  if (!session || !session.callSid) return;
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
