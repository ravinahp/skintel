require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const RedditService = require('./services/redditService');

const app = express();
const redditService = new RedditService();

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Optimized endpoint to fetch posts from all subreddits
app.get('/api/collect', async (req, res) => {
  try {
    const subreddits = [
      'SkincareAddiction',
      'AsianBeauty',
      '30PlusSkinCare',
      'acne',
      'tretinoin'
    ];

    console.log('Starting data collection...');
    const postsPerSubreddit = parseInt(req.query.limit) || 25;
    
    const data = await redditService.fetchAllSubreddits(subreddits, postsPerSubreddit);
    
    // Group posts by subreddit for statistics
    const postsBySubreddit = data.reduce((acc, post) => {
      acc[post.subreddit] = (acc[post.subreddit] || 0) + 1;
      return acc;
    }, {});

    res.json({
      message: 'Data collection complete',
      statistics: {
        total_posts: data.length,
        posts_by_subreddit: postsBySubreddit
      },
      data: data
    });
  } catch (error) {
    console.error('Error collecting data:', error);
    res.status(500).json({ error: 'Failed to collect data' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});