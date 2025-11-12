import dotenv from 'dotenv';
dotenv.config();

import app from './app';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
