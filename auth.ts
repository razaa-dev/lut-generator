import type { NextAuthConfig } from "next-auth";
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const config: NextAuthConfig = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }
      
        // Handle sign-up
        if (credentials.isSignUp === "true") {
          const existingUser = await prisma.user.findUnique({
            where: { email: credentials.email },
          });
      
          if (existingUser) {
            throw new Error("An account with this email already exists");
          }
      
          // Hash the password before saving
          const hashedPassword = await bcrypt.hash(credentials.password, 10);
      
          // Create new user
          const newUser = await prisma.user.create({
            data: {
              email: credentials.email,
              password: hashedPassword,
              name: credentials.email.split("@")[0], // You can set a default name or prompt user for it
              plan: "free", // default plan
              credits: 10, // default credits
              customerId: `cus_${Math.random().toString(36).substring(2, 15)}`, // customerId example
              referralCode: `REF_${Math.random().toString(36).substring(2, 10).toUpperCase()}`, // example referral code
            },
          });
      
          return newUser;
        }
      
        // Handle login
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
      
        if (!user || !user.password) {
          throw new Error("User not found");
        }
      
        const isValid = await bcrypt.compare(credentials.password, user.password);
      
        if (!isValid) {
          throw new Error("Invalid password");
        }
      
        return user;
      }
      
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Add user data to the JWT token
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.plan = user.plan;
        token.credits = user.credits;
        token.customerId = user.customerId;
        token.referralCode = user.referralCode || "";
      }
      return token;
    },
    async session({ session, token }) {
      // Add token data to the session object
      if (session.user) {
        session.user.id = token.id;
        session.user.email = token.email;
        session.user.plan = token.plan;
        session.user.credits = token.credits;
        session.user.customerId = token.customerId;
        session.user.referralCode = token.referralCode;
      }
      return session;
    },
    async signIn({ user, account }) {
      try {
        if (account?.provider === "google") {
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email! },
          });

          if (!existingUser) {
            const customerId = `cus_${Math.random()
              .toString(36)
              .substring(2, 15)}`;
            const initialReferralCode = `REF_${Math.random()
              .toString(36)
              .substring(2, 10)
              .toUpperCase()}`;

            await prisma.user.create({
              data: {
                email: user.email!,
                name: user.name,
                image: user.image,
                plan: "free",
                customerId,
                credits: 10,
                referralCode: initialReferralCode,
              },
            });
          }
        }
        return true;
      } catch (error) {
        console.error("Sign-in error:", error);
        return false;
      }
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith(baseUrl)) return url;
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      return baseUrl;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
    newUser: "/auth/referral",
  },
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" }, // Use JWT strategy for session tokens
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
