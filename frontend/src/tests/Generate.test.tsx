// // src/tests/Generate.test.tsx
// import React from 'react';
// import { render, screen, waitFor, act } from '@testing-library/react';
// import '@testing-library/jest-dom';
// import userEvent from '@testing-library/user-event';
// import App from '../App';

// type FetchMock = jest.Mock;

// beforeEach(() => {
//   jest.restoreAllMocks();
// });

// afterEach(() => {
//   // cleanup the global fetch so other tests are isolated
//   // @ts-ignore
//   global.fetch = undefined;
// });

// test('generate flow: loading -> success -> history updated', async () => {
//   const mockFetch = jest.fn().mockResolvedValue({
//     ok: true,
//     json: async () => ({ url: '/images/generated-1.png', id: 'gen-1', prompt: 'A mountain at sunrise' }),
//   }) as FetchMock;
//   // @ts-ignore
//   global.fetch = mockFetch;

//   render(<App />);
//   const user = userEvent.setup();

//   // upload file
//   const file = new File(['dummy'], 'photo.png', { type: 'image/png' });
//   const uploadInput = screen.getByTestId('upload-input') as HTMLInputElement;
//   await act(async () => {
//     await user.upload(uploadInput, file);
//   });

//   // type prompt and choose style
//   await user.type(screen.getByTestId('prompt-input'), 'A mountain at sunrise');
//   await user.selectOptions(screen.getByTestId('style-select'), 'photorealistic');

//   // click generate
//   await user.click(screen.getByRole('button', { name: /generate/i }));

//   // loading indicator should appear
//   expect(await screen.findByTestId('generate-loading')).toBeInTheDocument();

//   // wait for fetch to be called and UI to update
//   await waitFor(() => expect(mockFetch).toHaveBeenCalled());

//   // success text should be visible (adjust text if your app uses different wording)
//   expect(await screen.findByText(/generation complete/i)).toBeInTheDocument();

//   // history updated: expect new entry with id or image src
//   const history = screen.getByTestId('history-list');
//   // either the id or the image src should appear depending on your implementation
//   expect(history).toHaveTextContent('gen-1');
//   const img = history.querySelector('img');
//   expect(img?.getAttribute('src')).toBe('/images/generated-1.png');
// });

// test('retries twice and succeeds on 3rd attempt', async () => {
//   const fetchMock = jest
//     .fn()
//     .mockRejectedValueOnce(new Error('network 1'))
//     .mockRejectedValueOnce(new Error('network 2'))
//     .mockResolvedValue({
//       ok: true,
//       json: async () => ({ url: '/images/generated-2.png', id: 'gen-2', prompt: 'retry prompt' }),
//     });

//   // @ts-ignore
//   global.fetch = fetchMock;

//   render(<App />);
//   const user = userEvent.setup();

//   // minimal inputs
//   const file = new File(['x'], 'x.png', { type: 'image/png' });
//   const uploadInput = screen.getByTestId('upload-input') as HTMLInputElement;
//   await act(async () => await user.upload(uploadInput, file));
//   await user.type(screen.getByTestId('prompt-input'), 'retry prompt');
//   await user.selectOptions(screen.getByTestId('style-select'), 'sketch');

//   await user.click(screen.getByRole('button', { name: /generate/i }));

//   // wait for 3 fetch attempts
//   await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 5000 });

//   // eventual success shown
//   expect(await screen.findByText(/generation complete/i)).toBeInTheDocument();
//   expect(screen.getByTestId('history-list')).toHaveTextContent('gen-2');
// });

// test('shows error after 3 failed attempts', async () => {
//   const fetchMock = jest.fn().mockRejectedValue(new Error('always fail'));
//   // @ts-ignore
//   global.fetch = fetchMock;

//   render(<App />);
//   const user = userEvent.setup();

//   const file = new File(['x'], 'x.png', { type: 'image/png' });
//   const uploadInput = screen.getByTestId('upload-input') as HTMLInputElement;
//   await act(async () => await user.upload(uploadInput, file));
//   await user.type(screen.getByTestId('prompt-input'), 'will fail');
//   await user.selectOptions(screen.getByTestId('style-select'), 'sketch');

//   await user.click(screen.getByRole('button', { name: /generate/i }));

//   // wait for 3 attempts and final failure UI
//   await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 5000 });
//   expect(await screen.findByText(/failed to generate after 3 attempts/i)).toBeInTheDocument();
// });

// test('abort button cancels in-flight request', async () => {
//   // We'll create a fetch promise that rejects when we call a stored reject function
//   let rejectFetch: (reason?: any) => void;
//   const fetchPromise = new Promise((_res, rej) => {
//     rejectFetch = rej;
//   });

//   const fetchMock = jest.fn().mockImplementation((_url, opts) => {
//     // If the signal is already aborted, immediately reject with AbortError-like object
//     const signal = opts?.signal;
//     if (signal?.aborted) {
//       return Promise.reject({ name: 'AbortError' });
//     }
//     // Wire up: if signal gets aborted we reject
//     if (signal && typeof signal.addEventListener === 'function') {
//       signal.addEventListener('abort', () => {
//         rejectFetch({ name: 'AbortError' });
//       });
//     } else {
//       // for our simple polyfill we can check .aborted later
//     }
//     // return a promise that will only resolve/reject when we call the reject
//     return fetchPromise;
//   });

//   // @ts-ignore
//   global.fetch = fetchMock;

//   render(<App />);
//   const user = userEvent.setup();

//   const file = new File(['x'], 'x.png', { type: 'image/png' });
//   const uploadInput = screen.getByTestId('upload-input') as HTMLInputElement;
//   await act(async () => await user.upload(uploadInput, file));
//   await user.type(screen.getByTestId('prompt-input'), 'abort test');
//   await user.selectOptions(screen.getByTestId('style-select'), 'photorealistic');

//   // start generation
//   await user.click(screen.getByRole('button', { name: /generate/i }));

//   // ensure fetch called once
//   await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

//   // click abort
//   await user.click(screen.getByRole('button', { name: /abort/i }));

//   // simulate the fetch being aborted
//   act(() => {
//     rejectFetch({ name: 'AbortError' });
//   });

//   // expect aborted UI
//   expect(await screen.findByText(/generation aborted/i)).toBeInTheDocument();
// });
