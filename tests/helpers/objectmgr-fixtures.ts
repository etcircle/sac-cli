import { readFile } from 'node:fs/promises';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

async function readFixture<T extends JsonValue>(fileName: string): Promise<T> {
  const raw = await readFile(new URL(`../../fixtures/redacted/${fileName}`, import.meta.url), 'utf8');
  return JSON.parse(raw) as T;
}

export function readObjectMgrReadObjectRequestFixture() {
  return readFixture('objectmgr.readObject.request.json');
}

export function readObjectMgrReadObjectResponseFixture() {
  return readFixture('objectmgr.readObject.response.json');
}

export function readObjectMgrValidateRequestFixture() {
  return readFixture('objectmgr.validate.request.json');
}

export function readObjectMgrValidateResponseFixture() {
  return readFixture('objectmgr.validate.response.json');
}
