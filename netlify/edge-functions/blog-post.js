import { neon } from 'https://esm.sh/@neondatabase/serverless';

export default async function handler(request, context) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  if (!slug) return context.next();

  try {
    const sql = neon(Deno.env.get('NETLIFY_DATABASE_URL'));
    const rows = await sql`
      SELECT title, meta_description, meta_keywords, image, excerpt, date_published
      FROM blogs
      WHERE slug = ${slug} AND status = 'published'
      LIMIT 1
    `;

    if (!rows.length) return context.next();

    const post = rows[0];
    const canonicalUrl = `https://databygagan.com/blog-post?slug=${slug}`;
    const image = post.image || 'https://databygagan.com/images/Hranalytics.png';
    const desc = post.meta_description || post.excerpt;
    const pubDate = post.date_published ? new Date(post.date_published).toISOString() : '';

    const response = await context.next();
    let html = await response.text();

    html = html.replace(
      `<title>Blog Post | Gagan BP Blog</title>`,
      `<title>${post.title} | Gagan BP</title>`
    );
    html = html.replace(
      `<meta name="description" content="Read expert articles on n8n automation, analytics, and web development.">`,
      `<meta name="description" content="${desc}">`
    );
    html = html.replace(
      `<meta name="keywords" content="blog post, n8n automation, web development, data analytics">`,
      `<meta name="keywords" content="${post.meta_keywords || ''}">`
    );
    html = html.replace(
      `<link rel="canonical" href="https://databygagan.com/blog-post">`,
      `<link rel="canonical" href="${canonicalUrl}">`
    );
    html = html.replace(
      `<link rel="alternate" hreflang="en" href="https://databygagan.com/blog-post">`,
      `<link rel="alternate" hreflang="en" href="${canonicalUrl}">`
    );
    html = html.replace(
      `<link rel="alternate" hreflang="x-default" href="https://databygagan.com/blog-post">`,
      `<link rel="alternate" hreflang="x-default" href="${canonicalUrl}">`
    );
    html = html.replace(
      `<meta property="og:title" content="Blog Post">`,
      `<meta property="og:title" content="${post.title}">`
    );
    html = html.replace(
      `<meta property="og:url" content="https://databygagan.com/blog-post">`,
      `<meta property="og:url" content="${canonicalUrl}">`
    );
    html = html.replace(
      `<meta property="og:description" content="Read expert articles on n8n automation, analytics, and web development.">`,
      `<meta property="og:description" content="${desc}">`
    );
    html = html.replace(
      `<meta property="og:image" content="https://databygagan.com/images/Hranalytics.png">`,
      `<meta property="og:image" content="${image}">`
    );
    html = html.replace(
      `<meta name="twitter:title" content="Blog Post | Gagan BP">`,
      `<meta name="twitter:title" content="${post.title} | Gagan BP">`
    );
    html = html.replace(
      `<meta name="twitter:description"\n        content="Practical guides on n8n automation, Power BI, SQL, and data analytics — real-world research and business solutions by Gagan BP, freelance technical partner.">`,
      `<meta name="twitter:description" content="${desc}">`
    );
    html = html.replace(
      `<meta name="twitter:image" content="https://databygagan.com/images/Hranalytics.png">`,
      `<meta name="twitter:image" content="${image}">`
    );
    html = html.replace(
      `<meta property="article:published_time" content="">`,
      `<meta property="article:published_time" content="${pubDate}">`
    );
    html = html.replace(
      `<meta property="article:modified_time" content="">`,
      `<meta property="article:modified_time" content="${pubDate}">`
    );

    return new Response(html, {
      headers: response.headers,
      status: response.status
    });

  } catch (e) {
    console.error('Edge function error:', e);
    return context.next();
  }
}

export const config = { path: '/blog-post' };
