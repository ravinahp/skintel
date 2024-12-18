const fetch = require('node-fetch');

class RedditService {
  constructor() {
    this.clientId = process.env.REDDIT_CLIENT_ID;
    this.clientSecret = process.env.REDDIT_CLIENT_SECRET;
    this.userAgent = process.env.REDDIT_USER_AGENT;
    this.accessToken = null;
    this.tokenExpiration = null;
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiration > Date.now()) {
      return this.accessToken;
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
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
    this.accessToken = data.access_token;
    this.tokenExpiration = Date.now() + (data.expires_in * 1000);
    return this.accessToken;
  }

  async fetchWithRetry(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
      } catch (error) {
        if (i === retries - 1) throw error;
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }

  async fetchAllSubreddits(subreddits, postsPerSubreddit = 25) {
    const token = await this.getAccessToken();
    const headers = {
      'Authorization': `Bearer ${token}`,
      'User-Agent': this.userAgent
    };

    // Process subreddits in chunks to avoid rate limits
    const chunkSize = 2;
    const allPosts = [];

    for (let i = 0; i < subreddits.length; i += chunkSize) {
      const subredditChunk = subreddits.slice(i, i + chunkSize);
      console.log(`Processing subreddits: ${subredditChunk.join(', ')}`);

      const chunkPromises = subredditChunk.map(async (subreddit) => {
        try {
          const data = await this.fetchWithRetry(
            `https://oauth.reddit.com/r/${subreddit}/top.json?limit=${postsPerSubreddit}&t=day`,
            { headers }
          );

          if (!data.data?.children) {
            console.error(`No data received for r/${subreddit}`);
            return [];
          }

          const posts = data.data.children.map(post => ({
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

          // Process posts in smaller chunks for comments
          const postChunkSize = 5;
          for (let j = 0; j < posts.length; j += postChunkSize) {
            const postChunk = posts.slice(j, j + postChunkSize);
            const postsWithComments = await Promise.all(
              postChunk.map(async (post) => {
                try {
                  const comments = await this.fetchTopComments(post.id);
                  return { ...post, top_comments: comments };
                } catch (error) {
                  console.error(`Error fetching comments for post ${post.id}:`, error);
                  return { ...post, top_comments: [] };
                }
              })
            );
            allPosts.push(...postsWithComments);
          }

          console.log(`✓ Completed fetching from r/${subreddit}`);
        } catch (error) {
          console.error(`Error fetching from r/${subreddit}:`, error);
        }
      });

      await Promise.all(chunkPromises);
      // Small delay between chunks to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Remove duplicates based on post ID
    const uniquePosts = Array.from(
      new Map(allPosts.map(post => [post.id, post])).values()
    );

    return uniquePosts;
  }

  async fetchTopComments(postId, limit = 5) {
    const token = await this.getAccessToken();
    
    try {
      const data = await this.fetchWithRetry(
        `https://oauth.reddit.com/comments/${postId}.json?limit=${limit}&sort=top`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': this.userAgent
          }
        }
      );

      if (!data[1]?.data?.children) {
        return [];
      }

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

module.exports = RedditService;