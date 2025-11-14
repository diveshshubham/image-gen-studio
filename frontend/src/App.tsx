import React, { useEffect, useRef, useState } from 'react';
import AuthForm from './components/AuthForm';
import Upload, { UploadHandle } from './components/Upload';
import StyleSelect from './components/StyleSelect';
import HistoryList from './components/HistoryList';
import Spinner from './components/Spinner';
import { useAuth } from './hooks/useAuth';
import { useGenerate } from './hooks/useGenerate';
import axios from 'axios';
import { motion } from 'framer-motion';


const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type GenerationItem = {
    id: number;
    prompt: string;
    style: string;
    imageUrl?: string | null;
    status: string;
    createdAt: string;
};

export default function App(): JSX.Element {
    const { token, logout } = useAuth();
    const [prompt, setPrompt] = useState('');
    const [style, setStyle] = useState('photorealistic');
    const [file, setFile] = useState<File | null>(null);
    const uploadRef = useRef<UploadHandle | null>(null);

    const [history, setHistory] = useState<GenerationItem[]>([]);
    const { generate, retry, loading, error, shouldRetry, abort } = useGenerate(token);
    const [dark, setDark] = useState<boolean>(() => localStorage.getItem('dark') === 'true');

    // Controls whether to show the studio or the auth screen
    const [showStudio, setShowStudio] = useState<boolean>(() => Boolean(token));

    // Apply dark mode class and persist preference
    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
        localStorage.setItem('dark', dark ? 'true' : 'false');
    }, [dark]);

    // Toggle studio when token changes
    useEffect(() => {
        setShowStudio(Boolean(token));
        if (token) {
            fetchHistory();
            // If hash points to studio, focus after a moment
            if (window.location.hash === '#studio') {
                setTimeout(() => {
                    const el = document.getElementById('studio');
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    (el?.querySelector('input, textarea, button') as HTMLElement | null)?.focus();
                }, 150);
            }
        }
    }, [token]);

    async function fetchHistory() {
        if (!token) return;
        try {
            const res = await axios.get<GenerationItem[]>(`${API}/generations?limit=5`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setHistory(res.data);
        } catch (err) {
            // fail silently for now; you could show a toast
            // console.error('fetchHistory', err);
        }
    }

    // Generate: send FormData to backend, then reset upload & refresh history
    async function handleGenerate() {
        if (!token) {
            // more friendly UX than alert: redirect to login
            setShowStudio(false);
            return;
        }

        const fd = new FormData();
        if (file) fd.append('image', file);
        fd.append('prompt', prompt);
        fd.append('style', style);

        try {
            await generate(fd); // hook handles retries/abort/errors
            // On success: clear upload preview + local file state and refresh history
            setFile(null);
            uploadRef.current?.reset();
            await fetchHistory();
            // optionally clear prompt: setPrompt('');
        } catch (err) {
            // generate hook surfaces friendly errors via its state
            // console.error('generate failed', err);
        }
    }

    function handleRestore(item: GenerationItem) {
        setPrompt(item.prompt);
        setStyle(item.style);
        // Optionally scroll up to the form
        const el = document.getElementById('studio');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    return (
        <div className="min-h-screen p-6 max-w-4xl mx-auto">
            {/* Header */}
            <header className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-extrabold tracking-tight">🎨 Image Generation Studio</h1>
                    <div className="text-sm text-[var(--muted)]">Create, retry, and save your best generations.</div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setDark((d) => !d)}
                        aria-label="Toggle dark mode"
                        className="px-3 py-2 rounded border hover:shadow-sm"
                    >
                        {dark ? '☀️ Light' : '🌙 Dark'}
                    </button>

                    {token && (
                        <button
                            onClick={() => {
                                logout();
                            }}
                            className="px-3 py-2 rounded border hover:bg-red-50 hover:text-red-600 transition"
                        >
                            Logout
                        </button>
                    )}
                </div>
            </header>

            {/* AUTH */}
            {!showStudio && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card max-w-xl mx-auto">
                    <AuthForm
                        onLoggedIn={() => {
                            setShowStudio(true);
                            window.location.hash = '#studio';
                            setTimeout(() => {
                                const el = document.getElementById('studio');
                                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                (el?.querySelector('input, textarea, button') as HTMLElement | null)?.focus();
                            }, 150);
                        }}
                    />
                </motion.div>
            )}

            {/* STUDIO */}
            {showStudio && (
                <motion.section id="studio" className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="grid md:grid-cols-2 gap-4 items-start">
                        <div>
                            {/* Upload with reset-able ref */}
                            <Upload
                                ref={uploadRef}
                                onChange={(file) => {
                                    setFile(file);
                                    setPrompt('');
                                }}
                            />

                            <input
                                className="border rounded px-3 py-2 mt-3 w-full bg-transparent"
                                placeholder="Describe your image (prompt)..."
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                            />

                            <div className="mt-3">
                                <StyleSelect value={style} onChange={setStyle} />
                            </div>

                            <div className="flex gap-2 mt-4">
                                <button
                                    onClick={() => {
                                        if (shouldRetry) {
                                            retry();
                                        } else {
                                            handleGenerate();
                                        }
                                    }}
                                    disabled={loading}
                                    className="bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-50"
                                >
                                    {loading ? 'Generating…' : shouldRetry ? 'Retry' : 'Generate'}
                                </button>

                                <button onClick={abort} disabled={!loading} className="border px-4 py-2 rounded">
                                    Abort
                                </button>
                            </div>

                            {loading && <Spinner />}
                            {error && <div className="text-red-400 mt-2">{error}</div>}
                        </div>

                        <div>
                            <h3 className="font-semibold mb-2">Recent Generations</h3>
                            <HistoryList items={history} onRestore={handleRestore} />
                        </div>
                    </div>
                </motion.section>
            )}
        </div>
    );
}
