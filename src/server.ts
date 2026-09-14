import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

app.listen(env.port, () => {
  console.log(`Inventory Reservation API listening on http://localhost:${env.port}`);
  console.log(`Swagger UI:   http://localhost:${env.port}/docs`);
  console.log(`OpenAPI JSON: http://localhost:${env.port}/openapi.json`);
});
