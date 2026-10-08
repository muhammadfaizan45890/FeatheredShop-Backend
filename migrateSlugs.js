import "dotenv/config"; // ✅ MUST BE FIRST – loads .env
import mongoose from 'mongoose';
import slugify from 'slugify';
import connectDB from './database/db.js';
import { Post } from './models/Post.js'; // adjust path if needed

const migrateSlugs = async () => {
  try {
    console.log('🔄 Starting slug migration...');
    await connectDB();

    // Find posts without slugs
    const posts = await Post.find({ slug: { $exists: false } });

    if (posts.length === 0) {
      console.log('✅ All posts already have slugs!');
      process.exit(0);
    }

    console.log(`📝 Found ${posts.length} posts without slugs`);

    for (const post of posts) {
      let baseSlug = slugify(post.title, { lower: true, strict: true });
      let slug = baseSlug;
      let counter = 1;

      // Ensure uniqueness
      while (await Post.findOne({ slug, _id: { $ne: post._id } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      post.slug = slug;
      await post.save();
      console.log(`✅ "${post.title}" → ${slug}`);
    }

    console.log('🎉 Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

migrateSlugs();