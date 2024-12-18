const RedditService = require('./redditService');

class DataCollectorService {
  constructor() {
    this.redditService = new RedditService();
    this.subreddits = [
      'SkincareAddiction',
      'AsianBeauty',
      '30PlusSkinCare',
      'acne',
      'tretinoin'
    ];
    
    this.timeframes = ['week', 'month', 'year'];
  }

  async collectAllData(postsPerSubreddit = 100) {
    const allData = [];
    
    for (const subreddit of this.subreddits) {
      console.log(`Collecting data from r/${subreddit}...`);
      
      for (const timeframe of this.timeframes) {
        try {
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const posts = await this.redditService.fetchSubredditPosts(
            subreddit,
            postsPerSubreddit,
            timeframe
          );
          
          allData.push(...posts);
          
          console.log(`✓ Collected ${posts.length} posts from r/${subreddit} (${timeframe})`);
        } catch (error) {
          console.error(`Error collecting from r/${subreddit} (${timeframe}):`, error.message);
        }
      }
    }
    
    const uniquePosts = Array.from(
      new Map(allData.map(post => [post.id, post])).values()
    );
    
    return {
      total_posts: uniquePosts.length,
      posts_by_subreddit: this.groupBySubreddit(uniquePosts),
      data: uniquePosts
    }; 
  }

  groupBySubreddit(posts) {
    return posts.reduce((acc, post) => {
      if (!acc[post.subreddit]) {
        acc[post.subreddit] = 0;
      }
      acc[post.subreddit]++;
      return acc;
    }, {});
  }
}

module.exports = DataCollectorService;