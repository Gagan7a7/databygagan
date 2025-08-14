import express from "express";
import cors from "cors";
import serverless from "serverless-http";
import { neon } from '@netlify/neon';

const app = express();
app.use(cors());
app.use(express.json());

const sql = neon(); // uses NETLIFY_DATABASE_URL automatically

// Explicit handler for Netlify POST /api/projects/set-featured
app.post("/api/projects/set-featured", async (req, res) => {
    console.log('Headers:', req.headers);
    console.log('Raw body:', req.body);
    console.log('Body type:', typeof req.body);
    let featuredTitles = [];
    let parsed = false;
    // Try to get titles from req.body.titles (JSON)
    if (req.body && Array.isArray(req.body.titles)) {
        featuredTitles = req.body.titles;
        parsed = true;
    }
    // If not, try to parse as JSON string
    if (!parsed && typeof req.body === 'string') {
        try {
            const json = JSON.parse(req.body);
            if (json && Array.isArray(json.titles)) {
                featuredTitles = json.titles;
                parsed = true;
            }
        } catch (e) {
            // Not JSON, try form-urlencoded
            const params = new URLSearchParams(req.body);
            if (params.has('titles[]')) {
                featuredTitles = params.getAll('titles[]');
                parsed = true;
            } else if (params.has('titles')) {
                featuredTitles = params.getAll('titles');
                parsed = true;
            }
        }
    }
    // If still not parsed, try to get from req.body directly (object)
    if (!parsed && req.body && typeof req.body === 'object' && Array.isArray(req.body.titles)) {
        featuredTitles = req.body.titles;
        parsed = true;
    }
    // Edge case: Netlify may parse body as object with stringified array
    if (!parsed && req.body && typeof req.body === 'object' && typeof req.body.titles === 'string') {
        try {
            const arr = JSON.parse(req.body.titles);
            if (Array.isArray(arr)) {
                featuredTitles = arr;
                parsed = true;
            }
        } catch (e) {}
    }
    if (!featuredTitles || featuredTitles.length === 0) {
        return res.status(400).json({ error: "No titles provided", debug: { rawBody: req.body, bodyType: typeof req.body } });
    }
    try {
        await sql`UPDATE projects SET featured = false`;
        await sql`UPDATE projects SET featured = true WHERE title IN (${featuredTitles})`;
        return res.json({ success: true, featured: featuredTitles });
    } catch (e) {
        return res.status(500).json({ error: "Failed to set featured projects" });
    }
});

// Ensure the projects table exists (run once per cold start)
async function ensureTable() {
    await sql`CREATE TABLE IF NOT EXISTS projects (
        title TEXT PRIMARY KEY,
        category TEXT,
        image TEXT,
        alt TEXT,
        dashboardUrl TEXT,
        codeUrl TEXT,
        description TEXT,
        tech JSONB,
        featured BOOLEAN
    )`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS featured BOOLEAN;`;
}

// Helper to run ensureTable before each request
app.use(async (req, res, next) => {
    try { await ensureTable(); } catch (e) { return res.status(500).json({ error: "DB setup failed" }); }
    next();
});

// Delete a project by title
app.delete("/api/projects/title/:title", async (req, res) => {
    const title = decodeURIComponent(req.params.title);
    try {
        const result = await sql`DELETE FROM projects WHERE title = ${title} RETURNING *`;
        if (result.length === 0) return res.status(404).json({ error: "Project not found" });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Failed to delete project" });
    }
});

// Get all projects
app.get("/api/projects", async (req, res) => {
    try {
        const projects = await sql`SELECT * FROM projects`;
        // Convert tech from JSONB to array and fix property names for frontend
        const result = projects.map(p => ({
            title: p.title,
            category: p.category,
            image: p.image,
            alt: p.alt,
            dashboardUrl: p.dashboardurl || p.dashboardUrl,
            codeUrl: p.codeurl || p.codeUrl,
            description: p.description,
            tech: Array.isArray(p.tech) ? p.tech : (p.tech ? p.tech : []),
            featured: p.featured
        }));
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch projects" });
    }
});

// Add a new project
app.post("/api/projects", async (req, res) => {
    const p = req.body;
    try {
        await sql`
            INSERT INTO projects (title, category, image, alt, dashboardUrl, codeUrl, description, tech, featured)
            VALUES (
                ${p.title},
                ${p.category},
                ${p.image},
                ${p.alt},
                ${p.dashboardUrl},
                ${p.codeUrl},
                ${p.description},
                ${JSON.stringify(p.tech)},
                ${typeof p.featured === 'boolean' ? p.featured : false}
            )
            ON CONFLICT (title) DO NOTHING
        `;
        res.json({ success: true, project: p });
    } catch (e) {
        res.status(500).json({ error: "Failed to add project" });
    }
});

// Update a project by title
app.put("/api/projects/title/:title", async (req, res) => {
    const title = decodeURIComponent(req.params.title);
    const p = req.body;
    try {
        const result = await sql`
            UPDATE projects SET
                category = ${p.category},
                image = ${p.image},
                alt = ${p.alt},
                dashboardUrl = ${p.dashboardUrl},
                codeUrl = ${p.codeUrl},
                description = ${p.description},
                tech = ${JSON.stringify(p.tech)},
                featured = ${typeof p.featured === 'boolean' ? p.featured : false}
            WHERE title = ${title}
            RETURNING *
        `;
        if (result.length === 0) return res.status(404).json({ error: "Project not found" });
        res.json({ success: true, project: p });
    } catch (e) {
        res.status(500).json({ error: "Failed to update project" });
    }
});

// The serverless handler
export const handler = serverless(app);
