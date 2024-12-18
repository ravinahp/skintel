# Reddit Content Aggregator API

A Node.js backend service that aggregates and filters high-quality content from Reddit using Reddit's API. The service includes automated scheduling and content caching for optimal performance.

## 🚀 Features

- **Reddit Content Fetching**: Automatically fetches posts from specified subreddits
- **Quality Filtering**: Filters posts based on upvotes, comments, and content quality
- **Comment Aggregation**: Retrieves and processes top comments for each post
- **Caching System**: Implements efficient caching to reduce API calls
- **Rate Limiting**: Smart rate limiting to comply with Reddit's API guidelines
- **Parallel Processing**: Optimized batch processing for better performance

## 🛠️ Technical Stack

- **Runtime**: Node.js (>=14.0.0)
- **Framework**: Express.js
- **Dependencies**:
  - `node-fetch`: HTTP client for Reddit API calls
  - `node-cron`: Scheduling tasks
  - `cors`: Cross-origin resource sharing
  - `dotenv`: Environment variable management
  - `morgan`: HTTP request logger

## 📋 Prerequisites

- Node.js (>=14.0.0)
- Reddit API credentials (Client ID, Client Secret)
- npm or yarn package manager

## 🔧 Installation

1. Clone the repository: 