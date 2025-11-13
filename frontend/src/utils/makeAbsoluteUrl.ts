// frontend/src/utils/makeAbsoluteUrl.ts
export function makeAbsoluteUrl(url: string | undefined | null) {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    const base = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000';
    // ensure single slash
    return `${base.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
  }
  