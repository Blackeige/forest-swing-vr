// Relais multijoueur minimal, sans dépendance : implémente le strict nécessaire de RFC 6455 (texte, ping, close).
// Chaque message d'un client est retransmis aux autres clients de la même salle. Aucune autorité serveur (prototype).
import crypto from 'node:crypto';

const MAX_PAYLOAD = 16 * 1024, MAX_PER_ROOM = 16;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encode(str) {
  const p = Buffer.from(str), n = p.length; let h;
  if (n < 126) h = Buffer.from([0x81, n]); else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(n, 2); } else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([h, p]);
}
function* decode(state, chunk) {
  state.buf = Buffer.concat([state.buf, chunk]);
  for (;;) {
    const b = state.buf; if (b.length < 2) return;
    const op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0; let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; } else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > MAX_PAYLOAD || !masked) { yield { op: 8 }; return; }
    if (b.length < off + 4 + len) return;
    const mask = b.subarray(off, off + 4), data = Buffer.from(b.subarray(off + 4, off + 4 + len)); for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
    state.buf = b.subarray(off + 4 + len); yield { op, data };
  }
}

export function attachRelay(server, path = '/ws') {
  const rooms = new Map();
  server.on('upgrade', (req, socket) => {
    if (!req.url.startsWith(path) || !req.headers['sec-websocket-key']) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const st = { buf: Buffer.alloc(0) }; let room = null, id = null;
    const leave = () => {
      if (room && rooms.has(room)) { const set = rooms.get(room); set.delete(socket); for (const s of set) s.write(encode(JSON.stringify({ t: 'l', id }))); if (!set.size) rooms.delete(room); }
      room = null;
    };
    socket.on('data', (chunk) => {
      for (const f of decode(st, chunk)) {
        if (f.op === 8) { socket.end(); return; }
        if (f.op === 9) { socket.write(Buffer.from([0x8a, 0])); continue; }
        if (f.op !== 1) continue;
        let m; try { m = JSON.parse(f.data.toString()); } catch (e) { continue; }
        if (m.t === 'join' && typeof m.room === 'string' && !room) {
          const set = rooms.get(m.room) || new Set(); if (set.size >= MAX_PER_ROOM) { socket.end(); return; }
          rooms.set(m.room, set); set.add(socket); room = m.room; id = String(m.id || '');
        } else if (room && (m.t === 's')) { id = String(m.id || id); const out = encode(f.data.toString()); for (const s of rooms.get(room)) if (s !== socket) s.write(out); }
      }
    });
    socket.on('close', leave); socket.on('error', leave);
  });
  return { rooms };
}
