import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';

export class PineconeService {
  constructor() {
    this.pinecone = new Pinecone();
    this.index = null;
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async initialize() {
    try {
      this.index = this.pinecone.index(process.env.PINECONE_INDEX);
      await this.index.describeIndexStats();
      return true;
    } catch (error) {
      throw error;
    }
  }

  async generateEmbedding(text) {
    const response = await this.openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
    });
    return response.data[0].embedding;
  }

  async upsertPosts(posts) {
    const batchSize = 20;
    const results = { total: posts.length, added: 0, errors: 0 };

    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize);
      try {
        const vectors = await Promise.all(
          batch.map(async post => ({
            id: post.id,
            values: await this.generateEmbedding(`${post.title} ${post.selftext}`),
            metadata: {
              title: post.title,
              author: post.author,
              subreddit: post.subreddit,
              url: post.url,
              created_utc: post.created_utc,
              score: post.score,
              num_comments: post.num_comments,
              top_comments: post.top_comments?.slice(0, 5) || []
            }
          }))
        );
        await this.index.upsert(vectors);
        results.added += vectors.length;
      } catch (error) {
        results.errors++;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    return results;
  }

  async searchSimilar(query, limit = 5) {
    const queryEmbedding = await this.generateEmbedding(query);
    const results = await this.index.query({
      vector: queryEmbedding,
      topK: limit,
      includeMetadata: true
    });
    return results.matches.map(match => ({
      score: match.score,
      ...match.metadata
    }));
  }

  async getStats() {
    try {
      const stats = await this.index.describeIndexStats();
      return { status: 'connected', stats };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  async summarizeResults(query, searchResults) {
    if (!searchResults || searchResults.length === 0) {
        return `No relevant information found for "${query}". Please try a different search term.`;
    }

    const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
            {
                role: "system",
                content: `You are a helpful skincare expert. Your task is to:
1. ONLY summarize the provided Reddit posts and comments
2. DO NOT make up or infer information that isn't in the posts
3. If the posts don't contain relevant information, say so clearly
4. Format your response with:
   - Direct quotes or information from the posts
   - Clearly indicate if information is limited or not relevant`
            },
            {
                role: "user",
                content: `Question: ${query}\n\nRelevant posts:\n${searchResults.map(result => 
                    `Title: ${result.title}\nContent: ${result.text}\nComments: ${result.top_comments?.map(c => c.body).join(' ')}\n---`
                ).join('\n')}`
            }
        ],
        temperature: 0.3
    });

    return completion.choices[0].message.content;
  }
}