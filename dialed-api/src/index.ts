import 'dotenv/config';
import { createApp } from './app';
import { resolve } from 'node:path';
const port = Number(process.env.PORT ?? 3000);
const frontendDirectory = process.env.SERVE_FRONTEND === 'true' ? resolve(__dirname, '../../dialed-ui/dist') : undefined;
createApp({ frontendDirectory }).listen(port, '0.0.0.0', () => console.info(`Dialed listening on ${port}`));
