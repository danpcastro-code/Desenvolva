const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors({
  origin: ['https://desenvolva-2efaf.web.app', 'http://localhost:3000', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.post('/gemini', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key não configurada' });
  }

  try {
    const userMessage = req.body?.contents?.[0]?.parts?.[0]?.text || '';
    const maxTokens = req.body?.generationConfig?.maxOutputTokens || 16000;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    res.json({
      candidates: [{ content: { parts: [{ text }] } }]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
