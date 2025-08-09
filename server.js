// ...existing code...
const express = require("express");
const path = require("path");
const fs = require("fs");

const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for all origins
app.use(cors());

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files
app.use(express.static("."));
// Serve images
app.use("/images", express.static("images"));

// API endpoint to delete a project by unique title
app.delete("/api/projects/title/:title", (req, res) => {
    const title = decodeURIComponent(req.params.title);
    const projectsPath = path.join(__dirname, "projects.json");
    fs.readFile(projectsPath, "utf8", (err, data) => {
        if (err) {
            return res.status(500).json({ error: "Failed to read projects.json" });
        }
        let projects = [];
        try {
            projects = JSON.parse(data);
        } catch (e) {
            return res.status(500).json({ error: "Invalid projects.json format" });
        }
        const idx = projects.findIndex(p => p.title === title);
        if (idx === -1) {
            return res.status(404).json({ error: "Project not found" });
        }
        projects.splice(idx, 1);
        fs.writeFile(projectsPath, JSON.stringify(projects, null, 2), (err) => {
            if (err) {
                return res.status(500).json({ error: "Failed to update projects.json" });
            }
            res.json({ success: true });
        });
    });
});

// API endpoint to get all projects
app.get("/api/projects", (req, res) => {
    const projectsPath = path.join(__dirname, "projects.json");
    fs.readFile(projectsPath, "utf8", (err, data) => {
        if (err) {
            return res.status(500).json({ error: "Failed to read projects.json" });
        }
        let projects = [];
        try {
            projects = JSON.parse(data);
        } catch (e) {
            // If file is empty or invalid, return empty array
        }
        res.json(projects);
    });
});

// API endpoint to add a new project
app.post("/api/projects", (req, res) => {
    const newProject = req.body;
    const projectsPath = path.join(__dirname, "projects.json");
    fs.readFile(projectsPath, "utf8", (err, data) => {
        if (err) {
            return res.status(500).json({ error: "Failed to read projects.json" });
        }
        let projects = [];
        try {
            projects = JSON.parse(data);
        } catch (e) {
            // If file is empty or invalid, start with empty array
        }
        projects.push(newProject);
        fs.writeFile(projectsPath, JSON.stringify(projects, null, 2), (err) => {
            if (err) {
                return res.status(500).json({ error: "Failed to update projects.json" });
            }
            res.json({ success: true, project: newProject });
        });
    });
});
// API endpoint to update a project by unique title
app.put("/api/projects/title/:title", (req, res) => {
    const title = decodeURIComponent(req.params.title);
    const updatedProject = req.body;
    const projectsPath = path.join(__dirname, "projects.json");
    fs.readFile(projectsPath, "utf8", (err, data) => {
        if (err) {
            return res.status(500).json({ error: "Failed to read projects.json" });
        }
        let projects = [];
        try {
            projects = JSON.parse(data);
        } catch (e) {
            return res.status(500).json({ error: "Invalid projects.json format" });
        }
        const idx = projects.findIndex(p => p.title === title);
        if (idx === -1) {
            return res.status(404).json({ error: "Project not found" });
        }
        projects[idx] = updatedProject;
        fs.writeFile(projectsPath, JSON.stringify(projects, null, 2), (err) => {
            if (err) {
                return res.status(500).json({ error: "Failed to update projects.json" });
            }
            res.json({ success: true, project: updatedProject });
        });
    });
});
// Main route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Handle 404s
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Portfolio server running on http://0.0.0.0:${PORT}`);
    console.log(`Server accessible at http://localhost:${PORT}`);
});