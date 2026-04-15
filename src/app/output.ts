import { ExitCode } from './exit-codes.js';

export type SuccessEnvelope = {
  ok: true;
  data: Record<string, unknown>;
};

export type ErrorEnvelope = {
  ok: false;
  error: {
    code: string;
    message: string;
    exitCode: ExitCode;
  };
};

export type CommandEnvelope = SuccessEnvelope | ErrorEnvelope;

export function formatJsonEnvelope(envelope: CommandEnvelope): string {
  return JSON.stringify(envelope, null, 2);
}

export function formatPlainText(envelope: CommandEnvelope): string {
  if (!envelope.ok) {
    return `${envelope.error.code}: ${envelope.error.message}`;
  }

  return Object.entries(envelope.data)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n');
}
