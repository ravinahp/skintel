import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import SchedulerService from './services/schedulerService.js';
import RedditService from './services/redditService.js';

dotenv.config();

process.removeAllListeners('warning');

const app = express();
const redditService = new RedditService();
const scheduler = new SchedulerService();

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Start the scheduler in production only
if (process.env.NODE_ENV === 'production') {
  scheduler.startWeeklyUpdate();
  console.log('Weekly scheduler started in production mode');
}

// Health check endpoint for Render
app.get('/', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Original collect endpoint
app.get('/api/collect', async (req, res) => {
  try {
    const data = await scheduler.runManualUpdate();
    
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

// Enhanced scheduler status endpoint for monitoring
app.get('/api/scheduler/status', (req, res) => {
  const nextSunday = new Date();
  nextSunday.setDate(nextSunday.getDate() + (7 - nextSunday.getDay()) % 7);
  nextSunday.setHours(0, 0, 0, 0);

  res.json({
    status: 'healthy',
    environment: process.env.NODE_ENV,
    schedulerRunning: process.env.NODE_ENV === 'production',
    nextUpdate: nextSunday.toISOString(),
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Add better error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Optionally notify your error tracking service
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  // Optionally notify your error tracking service
});