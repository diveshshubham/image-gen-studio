import React, { useState, useRef, useImperativeHandle, forwardRef } from 'react';

export type UploadHandle = {
  reset: () => void;
};

export default forwardRef(function Upload(
  { onChange }: { onChange: (file: File | null) => void },
  ref: React.Ref<UploadHandle>
) {
  const [preview, setPreview] = useState<string | null>(() => {
    try {
      return localStorage.getItem('imagegen:lastUpload');
    } catch {
      return null;
    }
  });

  const inputRef = useRef<HTMLInputElement | null>(null);

  function clearAll() {
    setPreview(null);
    onChange(null);
    try {
      localStorage.removeItem('imagegen:lastUpload');
    } catch {
      // ignore
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  // expose reset() to parent via ref
  useImperativeHandle(ref, () => ({
    reset: clearAll
  }), []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    if (!file) {
      onChange(null);
      return setPreview(null);
    }
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      alert('Only PNG or JPEG allowed');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Max 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      try {
        localStorage.setItem('imagegen:lastUpload', dataUrl);
      } catch (err) {
        console.warn('Could not save preview to localStorage', err);
      }
    };
    reader.readAsDataURL(file);

    onChange(file);
  }

  return (
    <div>
      <label className="font-medium block mb-1">Upload Image</label>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg" onChange={handleFile} />
      {preview && (
        <img
          src={preview}
          alt="preview"
          className="mt-2 rounded-lg shadow-md max-h-48 object-cover border"
        />
      )}
    </div>
  );
});
