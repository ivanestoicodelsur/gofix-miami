import mongoose from 'mongoose';

export async function connectMongo() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gofix';
  await mongoose.connect(uri, {
    // options
  } as any);
  console.log('Connected to MongoDB');
}

export default connectMongo;
