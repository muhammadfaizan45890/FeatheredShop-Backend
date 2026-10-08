import "dotenv/config";

import express from "express";
import cors from "cors";
import passport from "passport";
import path from "path";
import { fileURLToPath } from "url";

import connectDB from "./database/db.js";

import userRoute from "./routes/userRoute.js";
import authRoute from "./routes/authRoute.js";
import adminRoute from "./routes/adminRoute.js";
import postRoutes from "./routes/postRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import commentActionsRoutes from "./routes/commentActionsRoutes.js";
import heroRoutes from "./routes/heroRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import advertiseRoutes from "./routes/advertiseRoutes.js";
import featuredRoutes from "./routes/featuredRoutes.js";
import audioRoutes from "./routes/audioRoutes.js";
import adRoutes from './routes/adRoutes.js'
import cartRoutes from "./routes/cartRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import checkoutRoutes from "./routes/checkoutRoutes.js";
import brandRoutes from "./routes/brandRoutes.js";






// Passport Google Strategy
import "./config/passport.js";

// ------------------------------------------------------------
// 1. Setup __dirname for ES Modules
// ------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------------------------------------
// 2. Create Express App
// ------------------------------------------------------------

const app = express();

const PORT = process.env.PORT || 5000;

// ------------------------------------------------------------
// 3. Allowed Frontend URLs
// ------------------------------------------------------------

const allowedOrigins = [
  "https://featherednews.vercel.app",
  "http://localhost:5173",
];

// Add CLIENT_URL from Railway environment if it exists
if (process.env.CLIENT_URL) {
  allowedOrigins.push(process.env.CLIENT_URL);
}

// Remove duplicates
const uniqueOrigins = [...new Set(allowedOrigins)];

// ------------------------------------------------------------
// 4. CORS
// ------------------------------------------------------------

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests without an origin
      // Example: Postman, server-to-server requests
      if (!origin) {
        return callback(null, true);
      }

      if (uniqueOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("❌ CORS blocked:", origin);

      return callback(
        new Error(`CORS policy: Origin ${origin} is not allowed`)
      );
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

// ------------------------------------------------------------
// 5. Body Parsers
// ------------------------------------------------------------

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------------------------------------------------
// 6. Passport
// ------------------------------------------------------------

app.use(passport.initialize());

// ------------------------------------------------------------
// 7. Static Files
// ------------------------------------------------------------

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

app.use(
  "/upload",
  express.static(path.join(__dirname, "upload"))
);

app.use(
  "/files",
  express.static(path.join(__dirname, "public/files"))
);


// Brand Logos Upload
app.use("/uploads", express.static("uploads"));

// ------------------------------------------------------------
// 8. Routes
// ------------------------------------------------------------

// Authentication
app.use("/auth", authRoute);

// Users
app.use("/user", userRoute);

// Admin
app.use("/admin", adminRoute);

// Posts
app.use("/api/posts", postRoutes);

app.use("/api/cart", cartRoutes);

app.use("/api/orders", orderRoutes);

app.use("/api/checkout", checkoutRoutes);

app.use("/api/brands", brandRoutes);





// Comments
app.use(
  "/api/posts/:postId/comments",
  commentRoutes
);

// Comment actions
app.use(
  "/api/comments",
  commentActionsRoutes
);

// Hero
app.use("/api/hero", heroRoutes);

// Contact
app.use("/api/contact", contactRoutes);

// Advertise
app.use("/api/advertise", advertiseRoutes);

// Featured
app.use("/api/featured", featuredRoutes);

// Audio
app.use("/api/audio", audioRoutes);
app.use('/api/ads', adRoutes);           // Ad content (banners)


// ------------------------------------------------------------
// 9. Health Check
// ------------------------------------------------------------

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    message: "Feathered News API is running",
  });
});

// ------------------------------------------------------------
// 10. 404 Handler
// ------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// ------------------------------------------------------------
// 11. Global Error Handler
// ------------------------------------------------------------

app.use((err, req, res, next) => {
  console.error("❌ Unhandled Error:", err);

  // CORS error
  if (err.message?.startsWith("CORS policy")) {
    return res.status(403).json({
      success: false,
      message: err.message,
    });
  }

  // Multer error
  if (err.name === "MulterError") {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  // General error
  return res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

// ------------------------------------------------------------
// 12. Start Server
// ------------------------------------------------------------

const startServer = async () => {
  try {
    // Connect MongoDB
    await connectDB();

    console.log("✅ Database connected");

    console.log(
      `🌐 CLIENT_URL: ${
        process.env.CLIENT_URL || "Not configured"
      }`
    );

    console.log(
      `🔑 Google Client ID: ${
        process.env.GOOGLE_CLIENT_ID
          ? "Loaded ✅"
          : "Missing ❌"
      }`
    );

    console.log(
      `🔐 Google Client Secret: ${
        process.env.GOOGLE_CLIENT_SECRET
          ? "Loaded ✅"
          : "Missing ❌"
      }`
    );

    console.log(
      `↩️ Google Callback URL: ${
        process.env.GOOGLE_CALLBACK_URL ||
        "Not configured"
      }`
    );

    app.listen(PORT, () => {
      console.log(
        `🚀 Server running on port ${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "❌ Failed to start server:",
      error
    );

    process.exit(1);
  }
};

startServer();





// import express from "express";
// import "dotenv/config";
// import cors from "cors";
// import passport from "passport";
// import path from "path";
// import { fileURLToPath } from "url";
// import { createServer } from "http"; // 👈 added
// import { Server as SocketServer } from "socket.io"; // 👈 added

// import connectDB from "./database/db.js";
// import userRoute from "./routes/userRoute.js";
// import authRoute from "./routes/authRoute.js";
// import adminRoute from "./routes/adminRoute.js";
// import postRoutes from "./routes/postRoutes.js";
// import commentRoutes from "./routes/commentRoutes.js";
// import commentActionsRoutes from "./routes/commentActionsRoutes.js";
// import heroRoutes from './routes/heroRoutes.js';
// import contactRoutes from './routes/contactRoutes.js';
// import advertiseRoutes from './routes/advertiseRoutes.js';

// import "./config/passport.js";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const app = express();
// const PORT = process.env.PORT || 5000;

// // ── Create HTTP server ────────────────────────────────
// const httpServer = createServer(app);

// // ── CORS (same as before) ─────────────────────────────
// const allowedOrigins = [
//   process.env.CLIENT_URL,
//   'https://muhammadfaizan45890-featherednews-f.vercel.app',
//   'http://localhost:5173',
//   'http://localhost:3000'
// ].filter(Boolean);

// app.use(cors({
//   origin: function (origin, callback) {
//     if (!origin) return callback(null, true);
//     if (allowedOrigins.indexOf(origin) !== -1) {
//       callback(null, true);
//     } else {
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true,
//   methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization"],
// }));

// // ── Express middleware ────────────────────────────────
// app.use(express.json());
// app.use(passport.initialize());

// app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// app.use("/upload", express.static(path.join(__dirname, "upload")));
// app.use("/files", express.static(path.join(__dirname, "public/files")));

// // ── Routes ─────────────────────────────────────────────
// app.use("/auth", authRoute);
// app.use("/user", userRoute);
// app.use("/admin", adminRoute);

// app.use("/api/posts", postRoutes);
// app.use("/api/posts/:postId/comments", commentRoutes);
// app.use("/api/comments", commentActionsRoutes);
// app.use('/api/hero', heroRoutes);
// app.use('/api/contact', contactRoutes);
// app.use('/api/advertise', advertiseRoutes);

// app.get("/", (req, res) => {
//   res.status(200).json({ status: "ok", message: "Server running" });
// });

// // ── 404 & error handlers ──────────────────────────────
// app.use((req, res) => {
//   res.status(404).json({
//     success: false,
//     message: `Route ${req.originalUrl} not found`,
//   });
// });

// app.use((err, req, res, next) => {
//   console.error("Unhandled error:", err);
//   if (err.name === "MulterError") {
//     return res.status(400).json({ success: false, message: err.message });
//   }
//   res.status(500).json({
//     success: false,
//     message: process.env.NODE_ENV === "production"
//       ? "Internal server error"
//       : err.message,
//   });
// });

// // ── Socket.IO ──────────────────────────────────────────
// const io = new SocketServer(httpServer, {
//   cors: {
//     origin: allowedOrigins,
//     credentials: true,
//     methods: ["GET", "POST"]
//   },
//   // If you use a custom path, uncomment:
//   // path: "/socket.io",
// });

// // Default namespace (optional)
// io.on("connection", (socket) => {
//   console.log("✅ New client connected:", socket.id);
//   socket.on("disconnect", () => {
//     console.log("❌ Client disconnected:", socket.id);
//   });
// });

// // ── Your missing namespace ────────────────────────────
// const noteApp = io.of("/note-app.users");
// noteApp.on("connection", (socket) => {
//   console.log("✅ User connected to /note-app.users:", socket.id);
//   // Add your real‑time logic here (e.g., notifications, chat, etc.)
//   socket.on("disconnect", () => {
//     console.log("❌ User disconnected from /note-app.users:", socket.id);
//   });
// });

// // ── Start server ──────────────────────────────────────
// const startServer = async () => {
//   try {
//     await connectDB();
//     console.log("✅ Database connected");
//     console.log(`🔧 CLIENT_URL: ${process.env.CLIENT_URL || "Not set"}`);
//     console.log(`🔑 Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? "Loaded ✅" : "Missing ❌"}`);
//     httpServer.listen(PORT, () => {
//       console.log(`🚀 Server listening on port ${PORT}`);
//       console.log(`📡 Socket.IO ready`);
//     });
//   } catch (error) {
//     console.error("❌ Failed to start server:", error);
//     process.exit(1);
//   }
// };

// startServer();
