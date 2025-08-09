const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require('cors');
const serverless = require('serverless-http');

const app = express();

// Enable CORS for all origins
app.use(cors());

// Middleware to parse JSON bodies
app.use(express.json());

// In a serverless environment, the __dirname will be the function's folder.
// We need to construct the path to projects.json from the project root.
const projectsPath = path.resolve(process.cwd(), 'projects.json');

// API endpoint to delete a project by unique title
app.delete("/api/projects/title/:title", (req, res) => {
    const title = decodeURIComponent(req.params.title);
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
    fs.readFile(projectsPath, "utf8", (err, data) => {
        if (err) {
            // If the file doesn't exist, it's not an error, just return an empty array.
            if (err.code === 'ENOENT') {
                return res.json([]);
            }
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
    fs.readFile(projectsPath, "utf8", (err, data) => {
        if (err && err.code !== 'ENOENT') {
            return res.status(500).json({ error: "Failed to read projects.json" });
        }
        let projects = [];
        try {
            if (data) {
                projects = JSON.parse(data);
            }
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

// The serverless handler
module.exports.handler = serverless(app);
