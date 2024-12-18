import fetch from 'node-fetch';

/**
 * RedditService class handles all Reddit API interactions
 * including authentication, post fetching, and comment retrieval
 */
class RedditService {
  /**
   * Initialize the Reddit service with credentials and state management
   * Requires environment variables:
   * - REDDIT_CLIENT_ID
   * - REDDIT_CLIENT_SECRET
   * - REDDIT_USER_AGENT
   */
  constructor() {
    // Store Reddit API credentials from environment variables
    this.clientId = process.env.REDDIT_CLIENT_ID;
    this.clientSecret = process.env.REDDIT_CLIENT_SECRET;
    this.userAgent = process.env.REDDIT_USER_AGENT;
    
    // Cache for the OAuth access token and its expiration
    this.accessToken = null;
    this.tokenExpiration = null;
    
    // Map to track the most recent post ID for each subreddit
    // Used for pagination to avoid fetching duplicate posts
    this.lastSeenPosts = new Map();
    
    // Add cache for posts and comments to reduce API calls
    this.postCache = new Map();
    this.commentCache = new Map();
    this.CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
    
    // Configure batch sizes and rate limits
    this.BATCH_SIZE = 25;
    this.COMMENT_BATCH_SIZE = 10;
    this.RATE_LIMIT_DELAY = 1000; // 1 second
  }

  /**
   * Handles OAuth authentication with Reddit's API
   * Returns a valid access token, either from cache or by requesting a new one
   * @returns {Promise<string>} The access token
   */
  async getAccessToken() {
    // Check if we have a valid cached token
    if (this.accessToken && this.tokenExpiration > Date.now()) {
      return this.accessToken;
    }

    // Create base64 encoded auth string required by Reddit OAuth
    // Format: base64(client_id:client_secret)
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    
    // Request new access token using client credentials flow
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.userAgent
      },
      body: 'grant_type=client_credentials'
    });

    const data = await response.json();
    
    // Cache the new token and calculate its expiration time
    this.accessToken = data.access_token;
    this.tokenExpiration = Date.now() + (data.expires_in * 1000);
    return this.accessToken;
  }

  // Add cache helper methods
  isCacheValid(timestamp) {
    return timestamp && (Date.now() - timestamp) < this.CACHE_DURATION;
  }

  /**
   * Optimized method to fetch posts from multiple subreddits in parallel
   */
  async fetchAllSubreddits(subreddits, postsPerSubreddit = 25) {
    const token = await this.getAccessToken();
    const headers = {
      'Authorization': `Bearer ${token}`,
      'User-Agent': this.userAgent
    };

    // Process subreddits in batches to balance speed and rate limits
    const allPosts = [];
    const batchSize = this.BATCH_SIZE;
    
    for (let i = 0; i < subreddits.length; i += batchSize) {
      const batch = subreddits.slice(i, i + batchSize);
      
      // Fetch posts from each subreddit in the batch concurrently
      const batchPromises = batch.map(async subreddit => {
        try {
          // Check cache first
          const cacheKey = `${subreddit}_${Date.now()}`;
          const cachedData = this.postCache.get(cacheKey);
          
          if (cachedData && this.isCacheValid(cachedData.timestamp)) {
            return cachedData.posts;
          }

          const lastSeenId = this.lastSeenPosts.get(subreddit);
          const url = `https://oauth.reddit.com/r/${subreddit}/hot.json?limit=${postsPerSubreddit}${lastSeenId ? `&after=t3_${lastSeenId}` : ''}`;
          
          const response = await fetch(url, { headers });
          const data = await response.json();

          if (!data.data?.children?.length) {
            return [];
          }

          this.lastSeenPosts.set(subreddit, data.data.children[0].data.id);

          const posts = data.data.children
            .filter(post => (
              post.data.score > 10 &&
              post.data.num_comments > 5 &&
              !post.data.removed &&
              !post.data.deleted &&
              post.data.selftext?.length > 0
            ))
            .map(post => ({
              id: post.data.id,
              title: post.data.title,
              selftext: post.data.selftext,
              url: `https://reddit.com${post.data.permalink}`,
              author: post.data.author,
              score: post.data.score,
              created_utc: post.data.created_utc,
              num_comments: post.data.num_comments,
              subreddit: post.data.subreddit
            }));

          // Cache the results
          this.postCache.set(cacheKey, {
            posts,
            timestamp: Date.now()
          });

          return posts;
        } catch (error) {
          console.error(`Error fetching from r/${subreddit}:`, error);
          return [];
        }
      });

      // Wait for all subreddits in the batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Fetch comments for all posts in the batch concurrently
      const postsWithComments = await this.fetchCommentsForPosts(
        batchResults.flat(),
        headers
      );
      
      allPosts.push(...postsWithComments);

      // Respect rate limits between batches
      if (i + batchSize < subreddits.length) {
        await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY));
      }
    }

    return allPosts;
  }

  /**
   * Optimized method to fetch comments for multiple posts in parallel
   */
  async fetchCommentsForPosts(posts, headers) {
    const batchSize = this.COMMENT_BATCH_SIZE;
    const results = [];

    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize);
      
      const commentPromises = batch.map(async post => {
        try {
          // Check comment cache
          const cacheKey = `comments_${post.id}`;
          const cachedComments = this.commentCache.get(cacheKey);
          
          if (cachedComments && this.isCacheValid(cachedComments.timestamp)) {
            post.top_comments = cachedComments.comments;
            return post;
          }

          const comments = await this.fetchTopComments(post.id, 5);
          
          // Cache the comments
          this.commentCache.set(cacheKey, {
            comments,
            timestamp: Date.now()
          });
          
          post.top_comments = comments;
          return post;
        } catch (error) {
          console.error(`Error fetching comments for post ${post.id}:`, error);
          post.top_comments = [];
          return post;
        }
      });

      const batchResults = await Promise.all(commentPromises);
      results.push(...batchResults);

      // Respect rate limits between batches
      if (i + batchSize < posts.length) {
        await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY));
      }
    }

    return results;
  }

  /**
   * Fetches top comments for a specific post
   * @param {string} postId - Reddit post ID
   * @param {number} limit - Maximum number of comments to fetch
   * @returns {Promise<Array>} Array of processed comments
   */
  async fetchTopComments(postId, limit = 5) {
    const token = await this.getAccessToken();
    
    try {
      // Fetch comments sorted by top score
      const response = await fetch(
        `https://oauth.reddit.com/comments/${postId}.json?limit=${limit}&sort=top`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': this.userAgent
          }
        }
      );

      const data = await response.json();
      
      // Handle case where no comments exist
      if (!data[1]?.data?.children) return [];

      // Filter and transform comments into clean format
      // Excludes stickied comments and empty comments
      return data[1].data.children
        .filter(comment => !comment.data.stickied && comment.data.body)
        .map(comment => ({
          id: comment.data.id,
          body: comment.data.body,
          author: comment.data.author,
          score: comment.data.score,
          created_utc: comment.data.created_utc
        }))
        .slice(0, limit);
    } catch (error) {
      console.error(`Error fetching comments for post ${postId}:`, error);
      return [];
    }
  }
}

export default RedditService;