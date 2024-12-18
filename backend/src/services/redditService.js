const fetch = require('node-fetch');

class RedditService {
  constructor() {
    this.clientId = process.env.REDDIT_CLIENT_ID;
    this.clientSecret = process.env.REDDIT_CLIENT_SECRET;
    this.userAgent = process.env.REDDIT_USER_AGENT;
    this.accessToken = null;
    this.tokenExpiration = null;
    // Track the last post ID we've seen for each subreddit
    this.lastSeenPosts = new Map();
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

  async fetchAllSubreddits(subreddits, postsPerSubreddit = 25) {
    const token = await this.getAccessToken();
    const headers = {
      'Authorization': `Bearer ${token}`,
      'User-Agent': this.userAgent
    };

    const allPosts = [];
    for (const subreddit of subreddits) {
      try {
        // Get the last seen post ID for this subreddit
        const lastSeenId = this.lastSeenPosts.get(subreddit);
        
        // Fetch new posts after the last seen ID
        const url = `https://oauth.reddit.com/r/${subreddit}/hot.json?limit=${postsPerSubreddit}${lastSeenId ? `&after=t3_${lastSeenId}` : ''}`;
        console.log(`Fetching from ${subreddit}, last seen: ${lastSeenId || 'none'}`);
        
        const response = await fetch(url, { headers });
        const data = await response.json();

        if (!data.data?.children?.length) {
          console.log(`No new posts found in r/${subreddit}`);
          continue;
        }

        // Update last seen post ID
        this.lastSeenPosts.set(subreddit, data.data.children[0].data.id);

        // Filter and process posts
        const posts = data.data.children
          .filter(post => {
            // Filter criteria for quality posts
            return post.data.score > 10 && // minimum upvotes
                   post.data.num_comments > 5 && // minimum comments
                   !post.data.removed && 
                   !post.data.deleted &&
                   post.data.selftext?.length > 0; // has content
          })
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

        // Fetch comments for each post
        for (const post of posts) {
          try {
            post.top_comments = await this.fetchTopComments(post.id, 5);
          } catch (error) {
            console.error(`Error fetching comments for post ${post.id}:`, error);
            post.top_comments = [];
          }
          // Add delay between comment fetches to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        allPosts.push(...posts);
        console.log(`✓ Fetched ${posts.length} new posts from r/${subreddit}`);

      } catch (error) {
        console.error(`Error fetching from r/${subreddit}:`, error);
      }
      // Add delay between subreddits to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return allPosts;
  }

  async fetchTopComments(postId, limit = 5) {
    const token = await this.getAccessToken();
    
    try {
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
      
      if (!data[1]?.data?.children) return [];

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