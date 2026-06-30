import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStorageKey, buildStoragePublicUrl } from '../utils/r2-storage.js';

test('buildStorageKey creates a safe object key', () => {
  const key = buildStorageKey('Mi Portada.JPG', 'books');
  assert.equal(key.startsWith('books/'), true);
  assert.equal(key.endsWith('.jpg'), true);
  assert.equal(key.includes('mi-portada'), true);
});

test('buildStoragePublicUrl joins base URL and key', () => {
  const url = buildStoragePublicUrl('https://cdn.example.com', 'books/mi-portada.jpg');
  assert.equal(url, 'https://cdn.example.com/books/mi-portada.jpg');
});
