import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
    try {
        console.log('Testing with config:', {
            environment: process.env.PINECONE_ENV,
            indexName: process.env.PINECONE_INDEX
        });

        const pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY,
            environment: process.env.PINECONE_ENV
        });

        const indexes = await pinecone.listIndexes();
        console.log('Available indexes:', indexes);

        const index = pinecone.index(process.env.PINECONE_INDEX);
        const stats = await index.describeIndexStats();
        console.log('Index stats:', stats);

    } catch (error) {
        console.error('Connection test failed:', {
            message: error.message,
            type: error.constructor.name
        });
    }
}

testConnection(); 