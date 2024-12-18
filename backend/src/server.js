import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { RedditService } from './services/redditService.js';
import { PineconeService } from './services/pineconeService.js';

const app = express();
const redditService = new RedditService();
const pineconeService = new PineconeService();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Initialize Pinecone and start server
async function startServer() {
  try {
    await pineconeService.initialize();
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Core endpoints
app.get('/api/collect-and-store', async (req, res) => {
  try {
    const posts = await redditService.fetchAllSubreddits([
      'SkincareAddiction', 'AsianBeauty', '30PlusSkinCare', 'acne', 'tretinoin'
    ], 25);
    const results = await pineconeService.upsertPosts(posts);
    res.json({ message: 'Data collection complete', results });
  } catch (error) {
    res.status(500).json({ error: 'Failed to collect and store data' });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Query required' });
    const results = await pineconeService.searchSimilar(query, 5);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/pinecone/stats', async (req, res) => {
  try {
    const stats = await pineconeService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});