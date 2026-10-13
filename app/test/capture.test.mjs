import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startCapture, stopCapture } from '../public/capture.js';
test('capture refuses unsupported or missing local models without starting a remote microphone', async () => {
  global.window = {};
  await assert.rejects(startCapture('en-US', () => {}, () => {}), /does not support/);
  let started = false;
  class Local { constructor() { this.processLocally = false; } start() { started = true; } }
  Local.prototype.processLocally = false;
  Local.available = async () => 'downloadable';
  global.window = { SpeechRecognition: Local };
  await assert.rejects(startCapture('en-US', () => {}, () => {}), /language pack is missing/);
  assert.equal(started, false);
  let instance;
  class Supported { constructor() { instance = this; } start() { started = true; } abort() { this.aborted = true; } }
  Supported.prototype.processLocally = false;
  Supported.available = async () => 'available';
  global.window = { SpeechRecognition: Supported };
  await startCapture('en-US', () => {}, () => {});
  assert.equal(instance.processLocally, true); assert.equal(instance.lang, 'en-US'); assert.equal(started, true);
  stopCapture(); assert.equal(instance.aborted, true); delete global.window;
});
