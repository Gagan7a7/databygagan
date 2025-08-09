// migrate-projects.js
// Run this script ONCE from your databygagan folder: node migrate-projects.js
// It will import all projects from projects.json into your Neon (Netlify DB) database.

const fs = require('fs');
const path = require('path');
const { neon } = require('@netlify/neon');
require('dotenv').config(); // If you want to use a .env file for NETLIFY_DATABASE_URL

const sql = neon(); // Uses NETLIFY_DATABASE_URL from env

async function main() {
  const projectsPath = path.join(__dirname, 'projects.json');
  const data = fs.readFileSync(projectsPath, 'utf8');
  const projects = JSON.parse(data);

  // Ensure table exists
  await sql`CREATE TABLE IF NOT EXISTS projects (
    title TEXT PRIMARY KEY,
    category TEXT,
    image TEXT,
    alt TEXT,
    dashboardUrl TEXT,
    codeUrl TEXT,
    description TEXT,
    tech JSONB
  )`;

  for (const p of projects) {
    await sql`
      INSERT INTO projects (title, category, image, alt, dashboardUrl, codeUrl, description, tech)
      VALUES (${p.title}, ${p.category}, ${p.image}, ${p.alt}, ${p.dashboardUrl}, ${p.codeUrl}, ${p.description}, ${JSON.stringify(p.tech)})
      ON CONFLICT (title) DO NOTHING
    `;
    console.log(`Imported: ${p.title}`);
  }
  console.log('All projects imported!');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
