// import mongoose from "mongoose";
// import "dotenv/config"; // ✅ load env variables

// const connectDB = async () => {
//   try {
//     const uri = process.env.MONGO_URI;
//     if (!uri) {
//       throw new Error("MONGO_URI is not defined in .env file");
//     }
//     await mongoose.connect(`${uri}/note-app`);
//     console.log('✅ MongoDB connected successfully');
//   } catch (error) {
//     console.log('❌ MongoDB connection error:', error.message);
//     process.exit(1);
//   }
// };

// export default connectDB;





import mongoose from "mongoose";
import "dotenv/config";

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;

    if (!uri) {
      throw new Error("MONGO_URI is not defined");
    }

    await mongoose.connect(uri, {
      dbName: "note-app",
    });

    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1);
  }
};

export default connectDB;
