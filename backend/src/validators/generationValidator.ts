import { z } from 'zod';

export const generationSchema = z.object({
  prompt: z.string().min(1),
  style: z.string().min(1)
});
