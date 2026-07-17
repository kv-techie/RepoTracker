import type { NextAuthOptions } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      if (profile) {
        // GitHub profile includes `login` (the @username)
        token.login = (profile as any).login;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.accessToken = token.accessToken as string;
        (session.user as any).login = token.login as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};


export function isAuthenticated(token: any): boolean {
  return !!token && !!token.accessToken;
}
