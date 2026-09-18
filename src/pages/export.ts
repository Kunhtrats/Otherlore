import type { APIRoute } from 'astro';
import { session, arcsFor } from '../lib/db';
export const GET: APIRoute = ({ url }) => {
  try {
    const id = url.searchParams.get('session') || '';
    const data = session(id);
    return new Response(JSON.stringify({ version: 1, ...data, arcs: arcsFor(id) }, null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="otherlore-session.json"' } });
  } catch { return new Response('Session not found.', { status: 404 }); }
};