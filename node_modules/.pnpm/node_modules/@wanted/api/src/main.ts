import "reflect-metadata";
import { createApp } from "./app.ts";

const app = await createApp();
const port = Number(process.env.API_PORT ?? 3001);
await app.listen(port);
console.log(`API en http://localhost:${port}`);
