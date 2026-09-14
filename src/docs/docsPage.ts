// Renders Swagger UI by loading it from a CDN rather than serving the
// swagger-ui-dist package's static files ourselves. swagger-ui-express's
// static assets don't reliably survive Vercel's serverless bundling (they
// live on disk in node_modules, which the bundler doesn't always carry over
// intact), so every asset request would 404/fall through and the page would
// render blank. Loading from a CDN sidesteps that entirely -- nothing here
// depends on the deployed function's filesystem.
export function renderDocsPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Inventory Reservation API - Docs</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: '/openapi.json',
          dom_id: '#swagger-ui',
          presets: [SwaggerUIBundle.presets.apis],
        });
      };
    </script>
  </body>
</html>`;
}
