import cors from 'cors';
import express, { Express } from 'express';
import { renderDocsPage } from './docs/docsPage';
import { openapiSpec } from './docs/openapi';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import routes from './routes';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/openapi.json', (_req, res) => res.json(openapiSpec));
  app.get('/docs', (_req, res) => res.type('html').send(renderDocsPage()));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use(routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
