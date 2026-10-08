import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { User } from "../models/userModel.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        "https://featherednews.up.railway.app/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Get Google user information safely
        const email = profile.emails?.[0]?.value;
        const googleId = profile.id;
        const username =
          profile.displayName || profile.name?.givenName || "Google User";
        const avatar = profile.photos?.[0]?.value || "";

        // Google must provide an email
        if (!email) {
          return done(new Error("Google account does not have an email"), null);
        }

        // Find existing user by email
        let user = await User.findOne({ email });

        if (user) {
          // Link Google account if not already linked
          if (!user.googleId) {
            user.googleId = googleId;
          }

          // Update avatar if available
          if (avatar) {
            user.avatar = avatar;
          }

          // Google has verified the email
          user.isVerified = true;

          // Add username if user doesn't already have one
          if (!user.username) {
            user.username = username;
          }

          // Set login status
          user.isLoggedIn = true;

          await user.save();

          return done(null, user);
        }

        // Create new user
        user = await User.create({
          googleId,
          email,
          username,
          avatar,
          isLoggedIn: true,
          isVerified: true,
        });

        return done(null, user);
      } catch (error) {
        console.error("Google Authentication Error:", error);
        return done(error, null);
      }
    }
  )
);

export default passport;
