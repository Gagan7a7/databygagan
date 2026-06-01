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

import crypto from 'crypto';

const sql = neon(); // uses NETLIFY_DATABASE_URL automatically
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_local_secret_databygagan_2026';

// Secure Authorization Middleware
function verifyToken(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return false;
        const [header, body, signature] = parts;
        const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');

        if (expectedSignature !== signature) return false;

        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (payload.exp && Date.now() / 1000 > payload.exp) return false; // Check expiration

        return payload.role === 'admin';
    } catch (e) {
        return false;
    }
}

const requireAuth = (req, res, next) => {
    // Only protect modifying routes (POST, PUT, DELETE)
    if (req.method === 'GET' || req.method === 'OPTIONS') {
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('Unauthorized access attempt: No Token');
        return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!verifyToken(token)) {
        console.warn('Unauthorized access attempt: Invalid Token');
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired token' });
    }

    next();
};

app.use(requireAuth);

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
        } catch (e) { }
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

// Ensure the projects and testimonials tables exist (run once per cold start)
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
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS linklabel TEXT;`;

    // Create testimonials table
    await sql`CREATE TABLE IF NOT EXISTS testimonials (
        id TEXT PRIMARY KEY,
        client_name TEXT NOT NULL,
        client_role TEXT,
        client_company TEXT,
        client_location TEXT,
        testimonial_text TEXT NOT NULL,
        short_quote TEXT,
        category TEXT NOT NULL,
        featured BOOLEAN DEFAULT false,
        project_related TEXT,
        key_highlights JSONB,
        date_added DATE NOT NULL
    )`;

    // Add show_date column if it doesn't exist
    try {
        await sql`ALTER TABLE testimonials ADD COLUMN show_date BOOLEAN DEFAULT false`;
    } catch (e) {
        // Column might already exist, which is fine
        if (!e.message.includes('already exists')) {
            console.error('Error adding show_date column:', e);
        }
    }

    // Create blogs table
    await sql`CREATE TABLE IF NOT EXISTS blogs (
        slug TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        image TEXT,
        alt TEXT,
        excerpt TEXT NOT NULL,
        read_time TEXT,
        author TEXT DEFAULT 'Gagan BP',
        date_published DATE NOT NULL,
        meta_description TEXT,
        meta_keywords TEXT,
        status TEXT DEFAULT 'draft',
        content JSONB NOT NULL
    )`;

    // Ensure status column exists (alteration check)
    try {
        await sql`ALTER TABLE blogs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'`;
    } catch (e) {}
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
            linklabel: p.linklabel || null
        }));
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch projects" });
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
    INSERT INTO projects (title, category, image, alt, dashboardUrl, codeUrl, description, tech, featured, linklabel)
    VALUES (
        ${p.title},
        ${p.category},
        ${p.image},
        ${p.alt},
        ${p.dashboardUrl},
        ${p.codeUrl},
        ${p.description},
        ${JSON.stringify(p.tech)},
        ${typeof p.featured === 'boolean' ? p.featured : false},
        ${p.linklabel || null}
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
        featured = ${typeof p.featured === 'boolean' ? p.featured : false},
        linklabel = ${p.linklabel || null}
    WHERE title = ${title}
    RETURNING *
`;
        if (result.length === 0) return res.status(404).json({ error: "Project not found" });
        res.json({ success: true, project: p });
    } catch (e) {
        res.status(500).json({ error: "Failed to update project" });
    }
});

// Testimonial CRUD Operations

// Get all testimonials
app.get("/api/testimonials", async (req, res) => {
    try {
        const testimonials = await sql`SELECT * FROM testimonials ORDER BY date_added DESC`;
        const result = testimonials.map(t => ({
            id: t.id,
            clientName: t.client_name,
            clientRole: t.client_role,
            clientCompany: t.client_company,
            clientLocation: t.client_location,
            testimonialText: t.testimonial_text,
            shortQuote: t.short_quote,
            category: t.category,
            featured: t.featured,
            projectRelated: t.project_related,
            keyHighlights: t.key_highlights || [],
            dateAdded: t.date_added
        }));
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch testimonials" });
    }
});

// Get a single testimonial
app.get("/api/testimonials/:id", async (req, res) => {
    const id = req.params.id;
    try {
        const testimonial = await sql`SELECT * FROM testimonials WHERE id = ${id}`;
        if (testimonial.length === 0) {
            return res.status(404).json({ error: "Testimonial not found" });
        }
        const t = testimonial[0];
        res.json({
            id: t.id,
            clientName: t.client_name,
            clientRole: t.client_role,
            clientCompany: t.client_company,
            clientLocation: t.client_location,
            testimonialText: t.testimonial_text,
            shortQuote: t.short_quote,
            category: t.category,
            featured: t.featured,
            projectRelated: t.project_related,
            keyHighlights: t.key_highlights || [],
            dateAdded: t.date_added
        });
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch testimonial" });
    }
});

// Add a new testimonial
app.post("/api/testimonials", async (req, res) => {
    let t = req.body;

    // Validate required fields
    if (!t.clientName || !t.testimonialText || !t.category) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        const result = await sql`
            INSERT INTO testimonials (
                id,
                client_name,
                client_role,
                client_company,
                client_location,
                testimonial_text,
                short_quote,
                category,
                featured,
                project_related,
                key_highlights,
                date_added,
                show_date
            ) VALUES (
                ${t.id || Date.now().toString()},
                ${t.clientName},
                ${t.clientRole || null},
                ${t.clientCompany || null},
                ${t.clientLocation || null},
                ${t.testimonialText},
                ${t.shortQuote || null},
                ${t.category},
                ${t.featured || false},
                ${t.projectRelated || null},
                ${JSON.stringify(t.keyHighlights || [])},
                ${t.dateAdded || new Date().toISOString().split('T')[0]},
                ${t.show_date !== undefined ? t.show_date : false}
            )
            RETURNING *
        `;
        res.json({ success: true, testimonial: result[0] });
    } catch (e) {
        console.error('Database error:', e);
        res.status(500).json({ error: "Failed to add testimonial", details: e.message });
    }
});

// Update a testimonial
app.put("/api/testimonials/:id", async (req, res) => {
    const id = req.params.id;
    const t = req.body;

    // Validate required fields
    if (!t.clientName || !t.testimonialText || !t.category) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        const result = await sql`
            UPDATE testimonials SET
                client_name = ${t.clientName},
                client_role = ${t.clientRole || null},
                client_company = ${t.clientCompany || null},
                client_location = ${t.clientLocation || null},
                testimonial_text = ${t.testimonialText},
                short_quote = ${t.shortQuote || null},
                category = ${t.category},
                featured = ${t.featured || false},
                project_related = ${t.projectRelated || null},
                key_highlights = ${JSON.stringify(t.keyHighlights || [])},
                show_date = ${t.show_date !== undefined ? t.show_date : false}
            WHERE id = ${id}
            RETURNING *
        `;
        if (result.length === 0) {
            return res.status(404).json({ error: "Testimonial not found" });
        }
        res.json({ success: true, testimonial: result[0] });
    } catch (e) {
        res.status(500).json({ error: "Failed to update testimonial" });
    }
});

// Delete a testimonial
app.delete("/api/testimonials/:id", async (req, res) => {
    const id = req.params.id;
    try {
        const result = await sql`DELETE FROM testimonials WHERE id = ${id} RETURNING *`;
        if (result.length === 0) {
            return res.status(404).json({ error: "Testimonial not found" });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Failed to delete testimonial" });
    }
});

// Set featured testimonials
app.post("/api/testimonials/set-featured", async (req, res) => {
    let { ids = [] } = req.body;
    if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "IDs must be an array" });
    }
    try {
        await sql`UPDATE testimonials SET featured = false`;
        if (ids.length > 0) {
            await sql`UPDATE testimonials SET featured = true WHERE id IN ${sql(ids)}`;
        }
        return res.json({ success: true, featured: ids });
    } catch (e) {
        return res.status(500).json({ error: "Failed to set featured testimonials" });
    }
});

// === BLOGS CRUD OPERATIONS ===

// Get all blogs (only published blogs return to public, all return to authorized admin with ?all=true)
app.get("/api/blogs", async (req, res) => {
    const showAll = req.query.all === 'true';
    let tokenValid = false;
    if (showAll) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            tokenValid = verifyToken(token);
        }
    }

    try {
        let blogs;
        if (showAll && tokenValid) {
            blogs = await sql`SELECT * FROM blogs ORDER BY date_published DESC`;
        } else {
            blogs = await sql`SELECT * FROM blogs WHERE status = 'published' ORDER BY date_published DESC`;
        }
        const result = blogs.map(b => ({
            slug: b.slug,
            title: b.title,
            category: b.category,
            image: b.image,
            alt: b.alt,
            excerpt: b.excerpt,
            read_time: b.read_time,
            author: b.author,
            date_published: b.date_published,
            meta_description: b.meta_description,
            meta_keywords: b.meta_keywords,
            status: b.status,
            content: b.content
        }));
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch blogs" });
    }
});

// Get a single blog post by slug
app.get("/api/blogs/:slug", async (req, res) => {
    const slug = req.params.slug;
    try {
        const blog = await sql`SELECT * FROM blogs WHERE slug = ${slug}`;
        if (blog.length === 0) {
            return res.status(404).json({ error: "Blog post not found" });
        }
        const b = blog[0];
        
        // If the post is not published, check authorization
        if (b.status !== 'published') {
            const authHeader = req.headers.authorization;
            let tokenValid = false;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                tokenValid = verifyToken(token);
            }
            if (!tokenValid) {
                return res.status(403).json({ error: "Access denied" });
            }
        }

        res.json({
            slug: b.slug,
            title: b.title,
            category: b.category,
            image: b.image,
            alt: b.alt,
            excerpt: b.excerpt,
            read_time: b.read_time,
            author: b.author,
            date_published: b.date_published,
            meta_description: b.meta_description,
            meta_keywords: b.meta_keywords,
            status: b.status,
            content: b.content
        });
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch blog post" });
    }
});

// Add a new blog post (protected via global requireAuth)
app.post("/api/blogs", async (req, res) => {
    let b = req.body || {};
    if (!b.title || !b.slug || !b.content) {
        return res.status(400).json({ error: "Missing required fields (title, slug, and content are required)" });
    }
    try {
        const result = await sql`
            INSERT INTO blogs (
                slug, title, category, image, alt, excerpt, read_time, author, date_published, meta_description, meta_keywords, status, content
            ) VALUES (
                ${b.slug},
                ${b.title},
                ${b.category},
                ${b.image || null},
                ${b.alt || null},
                ${b.excerpt || ''},
                ${b.read_time || null},
                ${b.author || 'Gagan BP'},
                ${b.date_published || new Date().toISOString().split('T')[0]},
                ${b.meta_description || null},
                ${b.meta_keywords || null},
                ${b.status || 'draft'},
                ${JSON.stringify(b.content || [])}
            )
            ON CONFLICT (slug) DO NOTHING
            RETURNING *
        `;
        if (result.length === 0) {
            return res.status(400).json({ error: "Blog post with this slug already exists" });
        }
        res.json({ success: true, blog: result[0] });
    } catch (e) {
        console.error('Database error:', e);
        res.status(500).json({ error: "Failed to add blog post", details: e.message });
    }
});

// Update a blog post by slug (protected via global requireAuth)
app.put("/api/blogs/:slug", async (req, res) => {
    const slug = req.params.slug;
    const b = req.body;
    if (!b.title || !b.content) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    try {
        const result = await sql`
            UPDATE blogs SET
                title = ${b.title},
                category = ${b.category},
                image = ${b.image || null},
                alt = ${b.alt || null},
                excerpt = ${b.excerpt || ''},
                read_time = ${b.read_time || null},
                author = ${b.author || 'Gagan BP'},
                date_published = ${b.date_published || new Date().toISOString().split('T')[0]},
                meta_description = ${b.meta_description || null},
                meta_keywords = ${b.meta_keywords || null},
                status = ${b.status || 'draft'},
                content = ${JSON.stringify(b.content || [])}
            WHERE slug = ${slug}
            RETURNING *
        `;
        if (result.length === 0) {
            return res.status(404).json({ error: "Blog post not found" });
        }
        res.json({ success: true, blog: result[0] });
    } catch (e) {
        console.error('Database error:', e);
        res.status(500).json({ error: "Failed to update blog post", details: e.message });
    }
});

// Delete a blog post by slug (protected via global requireAuth)
app.delete("/api/blogs/:slug", async (req, res) => {
    const slug = req.params.slug;
    try {
        const blog = await sql`SELECT image FROM blogs WHERE slug = ${slug}`;
        if (blog.length === 0) return res.status(404).json({ error: "Blog post not found" });
        let imageUrl = blog[0]?.image;

        const result = await sql`DELETE FROM blogs WHERE slug = ${slug} RETURNING *`;

        // Destroy image in Cloudinary if it's a Cloudinary image URL
        let cloudinaryResult = null;
        if (imageUrl && imageUrl.startsWith('http') && imageUrl.includes('cloudinary.com')) {
            try {
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
                console.error('Cloudinary image delete error:', err);
            }
        }
        res.json({ success: true, cloudinary: cloudinaryResult });
    } catch (e) {
        res.status(500).json({ error: "Failed to delete blog post" });
    }
});

// The serverless handler
export const handler = serverless(app);
