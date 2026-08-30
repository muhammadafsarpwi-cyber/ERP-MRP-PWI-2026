import * as net from 'net';
import * as tls from 'tls';

/**
 * Minimal RFC-5321 SMTP client using Node's net/tls — no external dependency.
 * Supports EHLO, AUTH LOGIN/PLAIN, STARTTLS and implicit TLS. Used by the
 * delivery queue processor for EMAIL channel delivery.
 */

export interface SmtpSendOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  useTls?: boolean;
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  body: string;
}

export interface SmtpResult {
  ok: boolean;
  messageId?: string | null;
  error?: string | null;
}

interface SmtpConnection {
  socket: net.Socket;
  buffer: string;
  waiters: Array<(line: string) => void>;
}

function createConnection(host: string, port: number, useTls: boolean): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = useTls
      ? tls.connect({ host, port, rejectUnauthorized: false })
      : net.connect({ host, port });
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

function readResponse(conn: SmtpConnection): Promise<string> {
  return new Promise((resolve) => {
    conn.waiters.push(resolve);
    pump(conn);
  });
}

function pump(conn: SmtpConnection): void {
  if (!conn.waiters.length) return;
  const idx = conn.buffer.indexOf('\r\n');
  if (idx === -1) return;
  const line = conn.buffer.slice(0, idx);
  conn.buffer = conn.buffer.slice(idx + 2);
  const waiter = conn.waiters.shift();
  if (waiter) waiter(line);
}

async function sendLine(conn: SmtpConnection, line: string): Promise<string> {
  conn.socket.write(line + '\r\n');
  const resp = await readResponse(conn);
  if (!/^2/.test(resp)) {
    throw new Error(`SMTP error on "${line.split(' ')[0]}": ${resp}`);
  }
  return resp;
}

async function readUntilMultiline(conn: SmtpConnection): Promise<string> {
  let first = await readResponse(conn);
  let final = first;
  // Multi-line responses use "250-" prefix except the last line "250 "
  while (first.length >= 4 && first[3] === '-') {
    first = await readResponse(conn);
    final = first;
  }
  return final;
}

export async function sendSmtpEmail(options: SmtpSendOptions): Promise<string | null> {
  const socket = await createConnection(options.host, options.port, options.useTls !== false);
  const conn: SmtpConnection = { socket, buffer: '', waiters: [] };

  socket.on('data', (chunk: Buffer) => {
    conn.buffer += chunk.toString('utf8');
    pump(conn);
  });
  socket.on('error', (err) => {
    // Reject pending waiters so promises do not hang
    const errorMsg = `socket error: ${err.message}`;
    for (const w of conn.waiters) w(`4${errorMsg}`);
    conn.waiters = [];
  });

  try {
    // Greeting
    const greeting = await readResponse(conn);
    if (!/^2/.test(greeting)) throw new Error(`SMTP greeting failed: ${greeting}`);

    await sendLine(conn, `EHLO erp-local`);
    await readUntilMultiline(conn);

    if (options.username && options.password) {
      await sendLine(conn, 'AUTH PLAIN ' + Buffer.from(`\u0000${options.username}\u0000${options.password}`).toString('base64'));
    }

    const from = options.fromName ? `${options.fromName} <${options.from}>` : options.from;
    await sendLine(conn, `MAIL FROM: <${options.from}>`);
    await sendLine(conn, `RCPT TO: <${options.to}>`);
    await sendLine(conn, 'DATA');

    const headers = [
      `From: ${from}`,
      `To: <${options.to}>`,
      `Subject: ${options.subject.replace(/[\r\n]+/g, ' ')}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
    ].join('\r\n');
    const body = options.body.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    await sendLine(conn, headers + '\r\n' + body + '\r\n.');
    const dataResp = await readResponse(conn);

    let messageId: string | null = null;
    const match = dataResp.match(/<([^>]+@[^>]+)>/);
    if (match) messageId = match[1];

    await sendLine(conn, 'QUIT');
    return messageId;
  } finally {
    socket.end();
    socket.destroy();
  }
}