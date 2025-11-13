import { useState, useRef } from 'react';
import axios from 'axios';
import { useRetry } from './useRetry';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export function useGenerate(token: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const { runWithRetry } = useRetry(3);

  async function generate(formData: FormData) {
    setError(null);
    setLoading(true);
    controllerRef.current = new AbortController();

    try {
      const res = await runWithRetry(() =>
        axios.post(`${API}/generations`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          },
          signal: controllerRef.current!.signal
        })
      );
      setLoading(false);
      return res.data;
    } catch (err: any) {
      setLoading(false);
      if (axios.isCancel(err)) setError('Aborted');
      else if (err.response?.status === 503) setError('Model overloaded — please retry');
      else setError(err.message);
      throw err;
    }
  }

  function abort() {
    controllerRef.current?.abort();
  }

  return { generate, loading, error, abort };
}
