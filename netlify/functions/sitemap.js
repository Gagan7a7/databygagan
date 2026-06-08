const { neon } = require('@netlify/neon');

exports.handler = async function (event, context) {
  const sql = neon();
  const today = new Date().toISOString().split('T')[0];

  // Query published blog posts from Neon DB
  let blogs = [];
  try {
    blogs = await sql`SELECT slug, date_published FROM blogs WHERE status = 'published' ORDER BY date_published DESC`;
  } catch (err) {
    console.error('Sitemap DB query error:', err);
  }

  // Build dynamic blog URL entries
  let blogEntries = '';
  for (const blog of blogs) {
    const pubDate = blog.date_published
      ? new Date(blog.date_published).toISOString().split('T')[0]
      : today;
    blogEntries += `
  <url>
    <loc>https://databygagan.com/blog-post?slug=${encodeURIComponent(blog.slug)}</loc>
    <lastmod>${pubDate}</lastmod>
  </url>`;
  }

  // Full sitemap XML — static pages hardcoded from existing sitemap.xml
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">

  <!-- Homepage -->
  <url>
    <loc>https://databygagan.com/</loc>
    <lastmod>2026-03-08</lastmod>
    <image:image>
      <image:loc>https://databygagan.com/images/Hranalytics.png</image:loc>
      <image:title>HR Analytics Dashboard</image:title>
      <image:caption>Professional HR Analytics Dashboard built with Power BI</image:caption>
    </image:image>
  </url>

  <!-- About -->
  <url>
    <loc>https://databygagan.com/about</loc>
    <lastmod>2026-03-08</lastmod>
  </url>

  <!-- Skills -->
  <url>
    <loc>https://databygagan.com/skills</loc>
    <lastmod>2026-03-08</lastmod>
  </url>

  <!-- Projects -->
  <url>
    <loc>https://databygagan.com/projects</loc>
    <lastmod>2026-03-08</lastmod>
    <image:image>
      <image:loc>https://databygagan.com/images/Hranalytics.png</image:loc>
      <image:title>HR Analytics Dashboard Project</image:title>
      <image:caption>HR Analytics Dashboard showcasing employee attrition metrics</image:caption>
    </image:image>
    <image:image>
      <image:loc>https://databygagan.com/images/AmazonSales.png</image:loc>
      <image:title>Amazon Sales Analytics Project</image:title>
      <image:caption>Amazon Sales Dashboard showing regional sales performance</image:caption>
    </image:image>
    <image:image>
      <image:loc>https://databygagan.com/images/heartdisease.png</image:loc>
      <image:title>Heart Disease Prediction Project</image:title>
      <image:caption>Machine Learning model for heart disease prediction</image:caption>
    </image:image>
    <image:image>
      <image:loc>https://databygagan.com/images/Suicide.png</image:loc>
      <image:title>Suicide Trends Analysis Project</image:title>
      <image:caption>Data analysis of suicide trends across Indian states</image:caption>
    </image:image>
    <image:image>
      <image:loc>https://databygagan.com/images/Netflix.png</image:loc>
      <image:title>Netflix Movie Analysis Project</image:title>
      <image:caption>Comprehensive analysis of Netflix movie dataset</image:caption>
    </image:image>
    <image:image>
      <image:loc>https://databygagan.com/images/Weatherdashboard.png</image:loc>
      <image:title>Weather Dashboard Project</image:title>
      <image:caption>Interactive weather data dashboard with real-time analytics</image:caption>
    </image:image>
  </url>

  <!-- Services -->
  <url>
    <loc>https://databygagan.com/services</loc>
    <lastmod>2026-03-08</lastmod>
  </url>

  <!-- Testimonials -->
  <url>
    <loc>https://databygagan.com/testimonials</loc>
    <lastmod>2026-03-08</lastmod>
  </url>

  <!-- FAQ -->
  <url>
    <loc>https://databygagan.com/faq</loc>
    <lastmod>2026-03-08</lastmod>
  </url>

  <!-- Contact -->
  <url>
    <loc>https://databygagan.com/contact</loc>
    <lastmod>2026-03-08</lastmod>
  </url>

  <!-- Blog Listing Page -->
  <url>
    <loc>https://databygagan.com/blog</loc>
    <lastmod>${today}</lastmod>
  </url>
${blogEntries}
</urlset>`;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600'
    },
    body: xml
  };
};
