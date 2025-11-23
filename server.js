import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

// ENV variables (set these in Render)
const GITHUB_TOKEN = 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; // PAT with repo access
const GITHUB_OWNER = Kalyancds; // e.g. "your-github-username"
const GITHUB_REPO = time-series-quiz;   // e.g. "time-series-quiz"
const RESULTS_PATH = "results.csv";
const FEEDBACK_PATH = "feedback.csv";

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  console.error("Missing GitHub env vars.");
}

// Generic CSV append helper
async function appendCSV(path, headerRow, rowArray) {
  const apiBase = "https://api.github.com";
  const url = `${apiBase}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

  // 1. Get current file (if exists)
  let sha = null;
  let content = "";
  const getRes = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "User-Agent": "quiz-backend"
    }
  });

  if (getRes.status === 200) {
    const json = await getRes.json();
    sha = json.sha;
    const buff = Buffer.from(json.content, "base64");
    content = buff.toString("utf8");
  } else if (getRes.status === 404) {
    // New file, write header first
    content = headerRow.join(",") + "\n";
  } else {
    const txt = await getRes.text();
    throw new Error(`GitHub GET error: ${getRes.status} ${txt}`);
  }

  // 2. Append new line
  const escapeCSV = (value) => {
    if (value == null) return "";
    const str = String(value);
    if (/[",\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const newLine = rowArray.map(escapeCSV).join(",") + "\n";
  const newContent = content + newLine;
  const encoded = Buffer.from(newContent, "utf8").toString("base64");

  // 3. PUT update
  const putRes = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "User-Agent": "quiz-backend",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `Append to ${path}`,
      content: encoded,
      sha: sha || undefined
    })
  });

  if (!putRes.ok) {
    const txt = await putRes.text();
    throw new Error(`GitHub PUT error: ${putRes.status} ${txt}`);
  }
}

// Results endpoint
app.post("/api/results", async (req, res) => {
  try {
    const { usn, name, score, total, timestamp } = req.body || {};
    if (!usn || !name || score == null || total == null) {
      return res.status(400).json({ error: "Missing fields" });
    }

    await appendCSV(
      RESULTS_PATH,
      ["USN", "Name", "Score", "Total", "Timestamp"],
      [usn, name, score, total, timestamp || new Date().toISOString()]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Error in /api/results:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Feedback endpoint
app.post("/api/feedback", async (req, res) => {
  try {
    const { usn, name, feedback, rating, timestamp } = req.body || {};
    if (!usn || !name) {
      return res.status(400).json({ error: "Missing fields" });
    }

    await appendCSV(
      FEEDBACK_PATH,
      ["USN", "Name", "Feedback", "Rating", "Timestamp"],
      [usn, name, feedback || "", rating || "", timestamp || new Date().toISOString()]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Error in /api/feedback:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Quiz backend listening on port", PORT);
});
