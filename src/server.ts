import { buildApp } from "./app.js";

const app = await buildApp();
const port = Number(process.env.PORT || 8686);
const host = process.env.HOST || "0.0.0.0";
await app.listen({ port, host });
console.log(`MikuHost-Api listening on ${host}:${port}`);
