// Tells the server "something happened", so it can send phone alerts to the right people.
// Safe to call anywhere: it never waits, never shows errors, and never breaks ordering.
export function pushOrder(cafe, id) { send({ cafe, kind: 'order', id }); }
export function pushCall(cafe, id) { send({ cafe, kind: 'call', id }); }
function send(body) {
  try {
    fetch('/api/notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), keepalive: true
    }).catch(() => {});
  } catch (e) { /* alerts are a bonus; ignore */ }
}
