import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.argv[2] || process.env.MONGODB_URI || process.env.MONGO_URI;

if (!uri) {
  console.log('\n❌ No MongoDB URI provided!');
  console.log('Usage:');
  console.log('  node test-mongo.js "mongodb+srv://<username>:<password>@cluster0.xxx.mongodb.net/nextgen_portal?retryWrites=true&w=majority"\n');
  process.exit(1);
}

const maskedUri = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
console.log(`\n⏳ Attempting to connect to MongoDB Atlas at: ${maskedUri}...`);

try {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 10000
  });

  console.log('✅ SUCCESS: Successfully connected to MongoDB Atlas!');
  console.log(`   Database Name: ${mongoose.connection.name}`);
  console.log(`   Cluster Host:  ${mongoose.connection.host}`);

  // Test ping
  const ping = await mongoose.connection.db.admin().ping();
  console.log('✅ MongoDB Ping OK:', ping);

  // List existing collections
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log(`✅ Existing Collections (${collections.length}):`, collections.map(c => c.name).join(', ') || 'None yet (will be auto-created on first run)');

  await mongoose.disconnect();
  console.log('\n🎉 Your MongoDB Atlas setup is 100% READY for Render and your website!\n');
} catch (err) {
  console.error('\n❌ Connection Failed:', err.message);
  if (err.message.includes('bad auth') || err.message.includes('Authentication failed')) {
    console.log('👉 Hint: Check your username and password. Remember to replace <password> with your actual MongoDB database user password.');
  } else if (err.message.includes('queryTxt ETIMEOUT') || err.message.includes('Server selection timed out')) {
    console.log('👉 Hint: Check your Network Access IP Whitelist in MongoDB Atlas! Make sure to add IP "0.0.0.0/0" (Allow access from anywhere).');
  }
  process.exit(1);
}
