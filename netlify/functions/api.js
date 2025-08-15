import express from "express";
import cors from "cors";
import serverless from "serverless-http";
import { neon } from '@netlify/neon';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global Buffer body parsing middleware for Netlify edge case
app.use((req, res, next) => {
    if (req.body && req.body.type === 'Buffer' && Array.isArray(req.body.data)) {
        try {
            const str = Buffer.from(req.body.data).toString('utf8');
            req.body = JSON.parse(str);
            console.log('Global middleware: Parsed Buffer body:', req.body);
        } catch (e) {
            console.log('Global middleware: Failed to parse Buffer body:', e);
            req.body = {};
        }
    }
    next();
});

// Fallback raw body parser for POST/PUT requests
app.use((req, res, next) => {
    if ((req.method === 'POST' || req.method === 'PUT') && req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
        let rawBody = '';
        req.on('data', chunk => {
            rawBody += chunk.toString();
        });
        req.on('end', () => {
            try {
                req.body = JSON.parse(rawBody);
                console.log('Fallback middleware: Parsed raw body:', req.body);
            } catch (e) {
                console.log('Fallback middleware: Failed to parse raw body:', e);
                req.body = {};
            }
            next();
        });
    } else {
        next();
    }
});

const sql = neon(); // uses NETLIFY_DATABASE_URL automatically

// Explicit handler for Netlify POST /api/projects/set-featured
app.post("/api/projects/set-featured", async (req, res) => {
    console.log('Headers:', req.headers);
    console.log('Raw body:', req.body);
    console.log('Body type:', typeof req.body);
    let featuredTitles = [];
    let parsed = false;
    let rawBody = req.body;
    // If Buffer, convert to string and parse as JSON
    if (rawBody && rawBody.type === 'Buffer' && Array.isArray(rawBody.data)) {
        try {
            const str = Buffer.from(rawBody.data).toString('utf8');
            console.log('Converted Buffer to string:', str);
            const json = JSON.parse(str);
            if (json && Array.isArray(json.titles)) {
                featuredTitles = json.titles;
                parsed = true;
            }
        } catch (e) {
            console.log('Buffer parse failed:', e);
        }
    }
    // Try to get titles from rawBody.titles (JSON)
    if (!parsed && rawBody && typeof rawBody === 'object' && Array.isArray(rawBody.titles)) {
        featuredTitles = rawBody.titles;
        parsed = true;
    }
    // If not, try to parse as JSON string
    if (!parsed && typeof rawBody === 'string') {
        try {
            const json = JSON.parse(rawBody);
            if (json && Array.isArray(json.titles)) {
                featuredTitles = json.titles;
                parsed = true;
            }
        } catch (e) {
            // Not JSON, try form-urlencoded
            const params = new URLSearchParams(rawBody);
            if (params.has('titles[]')) {
                featuredTitles = params.getAll('titles[]');
                parsed = true;
            } else if (params.has('titles')) {
                featuredTitles = params.getAll('titles');
                parsed = true;
            }
        }
    }
    // Edge case: Netlify may parse body as object with stringified array
    if (!parsed && rawBody && typeof rawBody === 'object' && typeof rawBody.titles === 'string') {
        try {
            const arr = JSON.parse(rawBody.titles);
            if (Array.isArray(arr)) {
                featuredTitles = arr;
                parsed = true;
            }
        } catch (e) {}
    }
    if (!featuredTitles || featuredTitles.length === 0) {
        return res.status(400).json({ error: "No titles provided", debug: { rawBody, bodyType: typeof rawBody } });
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
        featured BOOLEAN,
        clicks_dashboardUrl INTEGER DEFAULT 0,
        clicks_codeUrl INTEGER DEFAULT 0
    )`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS featured BOOLEAN;`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS clicks_dashboardUrl INTEGER DEFAULT 0;`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS clicks_codeUrl INTEGER DEFAULT 0;`;
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
        // Get project first to find image URL
        const project = await sql`SELECT image FROM projects WHERE title = ${title}`;
        let imageUrl = project[0]?.image;

        // Delete project from DB
        const result = await sql`DELETE FROM projects WHERE title = ${title} RETURNING *`;
        if (result.length === 0) return res.status(404).json({ error: "Project not found" });

        // Delete image from Cloudinary if present and is a Cloudinary URL
        let cloudinaryResult = null;
        if (imageUrl && imageUrl.startsWith('http') && imageUrl.includes('cloudinary.com')) {
            try {
                // Extract public ID from URL
                // Example: https://res.cloudinary.com/<cloud_name>/image/upload/v1234567890/portfolio_uploads/filename.png
                const matches = imageUrl.match(/\/portfolio_uploads\/([^\.]+)\.[a-zA-Z0-9]+$/);
                let publicId = matches ? `portfolio_uploads/${matches[1]}` : null;
                if (publicId) {
                    const cloudinary = require('cloudinary').v2;
                    cloudinary.config({
                        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                        api_key: process.env.CLOUDINARY_API_KEY,
                        api_secret: process.env.CLOUDINARY_API_SECRET
                    });
                    cloudinaryResult = await cloudinary.uploader.destroy(publicId);
                }
            } catch (err) {
                // Log error but don't block project deletion
                console.error('Cloudinary image delete error:', err);
            }
        }
        res.json({ success: true, cloudinary: cloudinaryResult });
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
            featured: p.featured,
            clicks_dashboardUrl: p.clicks_dashboardurl || p.clicks_dashboardUrl || 0,
            clicks_codeUrl: p.clicks_codeurl || p.clicks_codeUrl || 0
        }));
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch projects" });
    }
});

// Increment click count for dashboardUrl
app.post("/api/projects/click/dashboard/:title", async (req, res) => {
    const title = decodeURIComponent(req.params.title);
    try {
        await sql`UPDATE projects SET clicks_dashboardUrl = COALESCE(clicks_dashboardUrl,0) + 1 WHERE title = ${title}`;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Failed to increment dashboardUrl clicks" });
    }
});

// Increment click count for codeUrl
app.post("/api/projects/click/code/:title", async (req, res) => {
    const title = decodeURIComponent(req.params.title);
    try {
        await sql`UPDATE projects SET clicks_codeUrl = COALESCE(clicks_codeUrl,0) + 1 WHERE title = ${title}`;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Failed to increment codeUrl clicks" });
    }
});

// Add a new project
app.post("/api/projects", async (req, res) => {
    // Enhanced debugging
    console.log('=== POST /api/projects DEBUG ===');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Raw body:', req.body);
    console.log('Body type:', typeof req.body);
    console.log('Body keys:', req.body ? Object.keys(req.body) : 'null');
    console.log('Title value:', req.body?.title);
    console.log('Title type:', typeof req.body?.title);
    console.log('================================');

    let p = req.body || {};
    // If body is a Buffer, parse it as JSON
    if (p && p.type === 'Buffer' && Array.isArray(p.data)) {
        try {
            const str = Buffer.from(p.data).toString('utf8');
            p = JSON.parse(str);
            console.log('Parsed Buffer body:', p);
        } catch (e) {
            console.log('Failed to parse Buffer body:', e);
            p = {};
        }
    }
    // Validate required fields with better error messages
    if (!p.title || typeof p.title !== 'string' || p.title.trim() === '') {
        console.log('Validation failed - title missing or invalid');
        return res.status(400).json({ 
            error: "Project title is required",
            debug: {
                receivedTitle: p.title,
                titleType: typeof p.title,
                bodyKeys: Object.keys(p),
                fullBody: p
            }
        });
    }
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
        console.error('Database error:', e);
        res.status(500).json({ error: "Failed to add project", details: e.message });
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
