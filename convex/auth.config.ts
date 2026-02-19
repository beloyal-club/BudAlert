/**
 * Convex Auth Configuration for Clerk Integration
 * 
 * SETUP REQUIRED:
 * 1. Create Clerk account at https://clerk.com
 * 2. Create application and get Publishable Key
 * 3. In Clerk Dashboard → JWT Templates → Create "convex" template
 * 4. Copy the Issuer URL (format: https://verb-noun-00.clerk.accounts.dev)
 * 5. Set CLERK_JWT_ISSUER_DOMAIN in Convex Dashboard → Settings → Environment Variables
 */

export default {
  providers: [
    {
      // The domain from Clerk's "convex" JWT template
      // Set this in Convex Dashboard: Settings → Environment Variables → CLERK_JWT_ISSUER_DOMAIN
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      // This MUST match the JWT template name in Clerk (always "convex")
      applicationID: "convex",
    },
  ],
};
