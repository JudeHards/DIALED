import 'dotenv/config';
import { createApp } from './app';
const port = Number(process.env.PORT ?? 3000);
createApp().listen(port, () => console.info(`Dialed API listening on ${port}`));
