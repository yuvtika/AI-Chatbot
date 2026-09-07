// server.js
// Simple Express server that serves the static site and injects the Gemini API key
// Place a .env file in the project root with GEMINI_API_KEY=your_key_here

const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Serve static files from the project root
app.use(express.static(__dirname));

// Inject the API key into a global variable before serving index.html
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  let html = require('fs').readFileSync(indexPath, 'utf8');
  const key = process.env.GEMINI_API_KEY || '';
  // Insert a script tag before the closing </head> to expose the key
  const injection = `\n    <script>window.__GEMINI_API_KEY__ = "${key}";</script>`;
  html = html.replace('</head>', `${injection}</head>`);
  res.send(html);
});

// Proxy for DuckDuckGo search (avoids browser CORS issues)
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json([]);

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const fetchRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    const data = await fetchRes.json();

    const results = [];
    if (data.Heading && data.AbstractText) {
      results.push({
        title: data.Heading,
        description: data.AbstractText,
        url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
      });
    }

    if (Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 50),
            description: topic.Text,
            url: topic.FirstURL
          });
        } else if (Array.isArray(topic.Topics)) {
          for (const sub of topic.Topics) {
            if (sub.Text && sub.FirstURL) {
              results.push({
                title: sub.Text.split(' - ')[0] || sub.Text.slice(0, 50),
                description: sub.Text,
                url: sub.FirstURL
              });
            }
          }
        }
      }
    }

    res.json(results.slice(0, 4));
  } catch (err) {
    res.json([]);
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
