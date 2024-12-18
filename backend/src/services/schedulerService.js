import cron from 'node-cron';
import RedditService from './redditService.js';

class SchedulerService {
    constructor() {
        this.redditService = new RedditService();
        this.subreddits = [
            'SkincareAddiction',
            'AsianBeauty',
            '30PlusSkinCare',
            'acne',
            'tretinoin'
        ];
    }

    startWeeklyUpdate() {
        // Runs every Sunday at midnight
        cron.schedule('0 0 * * 0', async () => {
            console.log('Starting weekly Reddit data collection...');
            try {
                const posts = await this.redditService.fetchAllSubreddits(this.subreddits, 100);
                console.log(`Successfully collected ${posts.length} posts`);
                
                // Here we'll add Pinecone update logic later
                // await this.updatePinecone(posts);
                
            } catch (error) {
                console.error('Error in weekly update:', error);
            }
        });

        console.log('Weekly scheduler initialized');
    }

    // For testing the collection without waiting for the schedule
    async runManualUpdate() {
        console.log('Starting manual data collection...');
        try {
            const posts = await this.redditService.fetchAllSubreddits(this.subreddits, 100);
            console.log(`Successfully collected ${posts.length} posts`);
            return posts;
        } catch (error) {
            console.error('Error in manual update:', error);
            throw error;
        }
    }
}

export default SchedulerService;