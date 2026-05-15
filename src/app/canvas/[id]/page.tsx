/**
 * Canvas Project Page
 * Serves deployed canvas projects as full HTML pages
 */

import { createClient } from "@libsql/client";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function getClient() {
  return createClient({
    url: process.env.TURSO_CONNECTION_URL || "file:./local.db",
    authToken: process.env.TURSO_AUTH_TOKEN || "fallback_token",
  });
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CanvasProjectPage({ params }: PageProps) {
  const { id } = await params;

  const client = getClient();
  const result = await client.execute({
    sql: 'SELECT title, html_content FROM canvas_projects WHERE id = ?',
    args: [id],
  });

  if (!result.rows || result.rows.length === 0) {
    notFound();
  }

  const title = result.rows[0].title as string;
  const html = result.rows[0].html_content as string;

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} — HireMindX Canvas</title>
        <style dangerouslySetInnerHTML={{ __html: `
          * { margin: 0; padding: 0; }
          html, body { width: 100%; height: 100%; overflow: hidden; }
          iframe { width: 100%; height: 100%; border: none; }
        `}} />
      </head>
      <body>
        <iframe
          srcDoc={html}
          sandbox="allow-scripts allow-popups allow-forms allow-same-origin"
          title={title}
        />
      </body>
    </html>
  );
}
