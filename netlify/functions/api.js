
import express from "express";
import cors from "cors";
import serverless from "serverless-http";
import { neon } from '@netlify/neon';

const app = express();
app.use(cors());
app.use(express.json());

const sql = neon(); // uses NETLIFY_DATABASE_URL automatically

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
        tech JSONB
    )`;
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
        // Convert tech from JSONB to array
        const result = projects.map(p => ({ ...p, tech: Array.isArray(p.tech) ? p.tech : (p.tech ? p.tech : []) }));
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
            INSERT INTO projects (title, category, image, alt, dashboardUrl, codeUrl, description, tech)
            VALUES (${p.title}, ${p.category}, ${p.image}, ${p.alt}, ${p.dashboardUrl}, ${p.codeUrl}, ${p.description}, ${JSON.stringify(p.tech)})
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
                tech = ${JSON.stringify(p.tech)}
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
