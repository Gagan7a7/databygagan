<?php
header('Content-Type: application/json');

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Get the raw POST data
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

$projectsFile = 'projects.json';

// Read existing projects
$projects = [];
if (file_exists($projectsFile)) {
    $json = file_get_contents($projectsFile);
    $projects = json_decode($json, true);
    if (!is_array($projects)) {
        $projects = [];
    }
}

// Append new project
$projects[] = $data;

// Save back to file
if (file_put_contents($projectsFile, json_encode($projects, JSON_PRETTY_PRINT))) {
    echo json_encode(['success' => true, 'project' => $data]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to update projects.json']);
}
