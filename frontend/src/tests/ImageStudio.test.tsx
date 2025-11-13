import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App'; // adjust if your top-level component is named differently

describe('Image Studio - basic render', () => {
  test('renders Upload, Prompt and StyleSelect and Generate button', () => {
    render(<App />);

    // these test ids must exist in your components
    expect(screen.getByTestId('upload-input')).toBeInTheDocument();
    expect(screen.getByTestId('prompt-input')).toBeInTheDocument();
    expect(screen.getByTestId('style-select')).toBeInTheDocument();

    // Check buttons
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
    // Optional: check for history list container
    expect(screen.getByTestId('history-list')).toBeInTheDocument();
  });

  test('style select can be changed (sanity)', async () => {
    render(<App />);
    const user = userEvent.setup();
    const style = screen.getByTestId('style-select') as HTMLSelectElement;

    // If your select includes "photorealistic", adjust value accordingly
    await user.selectOptions(style, 'photorealistic');
    expect(style.value).toBe('photorealistic');
  });
});
