// hooks/useGenerate.ts
import { useState, useRef } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type RetrySnapshot = {
  key: string;
  prompt: string;
  style: string;
  file?: File | null;
};

export function useGenerate(token: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shouldRetry, setShouldRetry] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<RetrySnapshot | null>(null); // immutable-ish snapshot

  // Helper to build FormData from snapshot
  function formDataFromSnapshot(s: RetrySnapshot) {
    const fd = new FormData();
    if (s.file) fd.append('image', s.file);
    fd.append('prompt', s.prompt);
    fd.append('style', s.style);
    fd.append('idempotencyKey', s.key);
    return fd;
  }

  // Helper to generate idempotency key
  function genKey(): string {
    return (globalThis as any).crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // Call this to start a generation (user's fresh click)
  // Accepts FormData for compatibility with your existing usage.
  async function generate(formData: FormData) {
    // Build a snapshot (immutable-ish): copy primitives + grab file once
    const key = genKey();
    const snapshot: RetrySnapshot = {
      key,
      prompt: String(formData.get('prompt') ?? ''),
      style: String(formData.get('style') ?? ''),
      // store the File object (if any) from the passed FormData
      file: (formData.get('image') as File) ?? null,
    };

    // Save snapshot for retry
    lastRequestRef.current = snapshot;

    // Build FormData to send (include idempotency key)
    const fdToSend = formDataFromSnapshot(snapshot);

    // proceed with single axios call (no automatic retries)
    return await doSend(fdToSend, snapshot.key);
  }

  // retry the last snapshot (if any) — resends the ORIGINAL payload but with a NEW idempotency key
  async function retry() {
    const s = lastRequestRef.current;
    if (!s) {
      setError('Nothing to retry');
      return null;
    }

    // create a new idempotency key for this retry (Option B server requires this)
    const newKey = genKey();

    // Keep payload identical, only replace the key
    const snapshotForRetry: RetrySnapshot = {
      ...s,
      key: newKey,
    };

    // update the stored snapshot so subsequent UI still shows original payload
    lastRequestRef.current = snapshotForRetry;

    const fd = formDataFromSnapshot(snapshotForRetry);
    return await doSend(fd, snapshotForRetry.key);
  }

  // internal: single-shot network call with proper behavior
  async function doSend(fd: FormData, idempotencyKey: string) {
    setError(null);
    setShouldRetry(false);
    setLoading(true);
    controllerRef.current = new AbortController();

    try {
      const res = await axios.post(`${API}/generations`, fd, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          'Idempotency-Key': idempotencyKey,
          // axios automatically sets Content-Type for FormData
        },
        signal: controllerRef.current!.signal,
      });

      setLoading(false);

      // On success clear lastRequestRef to avoid duplicates
      lastRequestRef.current = null;
      setShouldRetry(false);
      setError(null);
      return res.data;
    } catch (err: any) {
      setLoading(false);

      if (axios.isCancel(err)) {
        setError('Aborted');
        return null;
      }

      const status = err?.response?.status;
      const bodyMsg = err?.response?.data?.message;

      // 503 (model overloaded) : keep snapshot, allow manual retry (create new key on retry)
      if (status === 503 || bodyMsg === 'Model overloaded') {
        setError('Generation failed — model overloaded. Please retry.');
        setShouldRetry(false);
        // keep lastRequestRef (so retry resends original payload)
        return null;
      }

      // 409 (idempotency key already marked failed) : inform user and allow retry (new key will be used)
      if (status === 409) {
        setError(bodyMsg || 'Previous attempt failed for this idempotency key. Please retry.');
        setShouldRetry(false);
        return null;
      }

      // other errors: show backend message and allow retry if appropriate
      setError(bodyMsg || 'Something went wrong');
      setShouldRetry(true);
      return null;
    }
  }

  function abort() {
    controllerRef.current?.abort();
  }

  return { generate, retry, loading, error, shouldRetry, abort };
}
